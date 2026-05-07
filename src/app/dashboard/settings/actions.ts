"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole, requireSession, requireStepUpReauth } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { AIProviderName, OcrEngineName, ProfileRole } from "@/types/database";

const FIRM_LOGO_BUCKET = "firm-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const orgSchema = z.object({
  name: z.string().min(2),
  logo_url: z.string().url().optional().or(z.literal("")),
});

export async function updateOrganizationAction(formData: FormData) {
  const ctx = await requireRole(["admin"]);
  const service = getServiceSupabase();
  const parsed = orgSchema.safeParse({
    name: formData.get("name"),
    logo_url: (formData.get("logo_url") as string | null) ?? "",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }
  const { error } = await service
    .from("organizations")
    .update({
      name: parsed.data.name,
      logo_url: parsed.data.logo_url ? parsed.data.logo_url : null,
    })
    .eq("id", ctx.organization.id);
  if (error) throw new Error(error.message);
  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "organization.updated",
    entityType: "organization",
    entityId: ctx.organization.id,
  });
  revalidatePath("/dashboard/settings");
}

/**
 * Upload a firm logo to the public `firm-logos` Supabase Storage bucket and
 * persist the resulting public URL on `organizations.logo_url`. Admin-only.
 *
 * Path scheme: `{organization_id}/logo-{timestamp}.{ext}`. Each upload uses
 * a fresh timestamp filename so we side-step Supabase / Cloudflare CDN
 * caching when an admin replaces the logo. Old files are best-effort
 * deleted so the bucket doesn't accumulate orphans.
 */
export async function uploadFirmLogoAction(formData: FormData) {
  const ctx = await requireRole(["admin"]);
  const file = formData.get("logo") as File | null;
  if (!file || typeof file === "string") {
    throw new Error("No logo file provided");
  }
  if (file.size === 0) {
    throw new Error("Logo file is empty");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller");
  }
  const mime = file.type;
  if (!ALLOWED_LOGO_MIME_TYPES.has(mime)) {
    throw new Error("Logo must be a PNG, JPEG, WebP, or SVG image");
  }
  const ext = MIME_EXTENSION[mime] ?? "png";

  const service = getServiceSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  // Cache-bust by embedding the upload timestamp in the filename — the CDN
  // will happily serve a stale logo for hours from any prior key, but a
  // brand-new key always produces a brand-new public URL.
  const storageKey = `${ctx.organization.id}/logo-${Date.now()}.${ext}`;

  const upload = await service.storage.from(FIRM_LOGO_BUCKET).upload(storageKey, buffer, {
    contentType: mime,
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) {
    throw new Error(`Logo upload failed: ${upload.error.message}`);
  }

  const { data: publicData } = service.storage.from(FIRM_LOGO_BUCKET).getPublicUrl(storageKey);
  const publicUrl = publicData.publicUrl;

  // Snapshot the previous logo so we can clean it up after the row update
  // succeeds — we only delete from storage once the DB has the new URL.
  const previousLogoUrl = ctx.organization.logo_url ?? null;

  const { error: updateError } = await service
    .from("organizations")
    .update({ logo_url: publicUrl })
    .eq("id", ctx.organization.id);
  if (updateError) {
    // The DB write is the source of truth — if it failed, roll back the
    // upload so we don't leave an orphan in the bucket pointing nowhere.
    await service.storage.from(FIRM_LOGO_BUCKET).remove([storageKey]);
    throw new Error(updateError.message);
  }

  if (previousLogoUrl) {
    const previousKey = extractStorageKey(previousLogoUrl, ctx.organization.id);
    if (previousKey) {
      // Best-effort cleanup of the prior object. We don't fail the action
      // if this errors — the DB already points at the new URL.
      await service.storage.from(FIRM_LOGO_BUCKET).remove([previousKey]);
    }
  }

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "organization.logo_uploaded",
    entityType: "organization",
    entityId: ctx.organization.id,
    metadata: { storageKey, mime, sizeBytes: file.size },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/upload/[token]", "page");
}

/**
 * Clear the firm's logo. Best-effort deletes the underlying storage
 * object when the URL points at our `firm-logos` bucket; externally pasted
 * URLs are simply unlinked from the row. Admin-only.
 */
export async function removeFirmLogoAction() {
  const ctx = await requireRole(["admin"]);
  const service = getServiceSupabase();

  const previousLogoUrl = ctx.organization.logo_url ?? null;

  const { error } = await service
    .from("organizations")
    .update({ logo_url: null })
    .eq("id", ctx.organization.id);
  if (error) throw new Error(error.message);

  if (previousLogoUrl) {
    const previousKey = extractStorageKey(previousLogoUrl, ctx.organization.id);
    if (previousKey) {
      await service.storage.from(FIRM_LOGO_BUCKET).remove([previousKey]);
    }
  }

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "organization.logo_removed",
    entityType: "organization",
    entityId: ctx.organization.id,
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/upload/[token]", "page");
}

/**
 * Pull a `firm-logos` storage key out of a public URL so we can clean it up.
 * Returns null when the URL doesn't look like one of our public-bucket
 * URLs or doesn't belong to the caller's organization (defence in depth —
 * the RLS policies already enforce the same scope).
 */
function extractStorageKey(publicUrl: string, organizationId: string): string | null {
  const marker = `/storage/v1/object/public/${FIRM_LOGO_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const key = publicUrl.slice(idx + marker.length).split("?")[0];
  if (!key.startsWith(`${organizationId}/`)) return null;
  return key;
}

const profileSchema = z.object({
  full_name: z.string().min(2),
});

export async function updateProfileAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const parsed = profileSchema.safeParse({ full_name: formData.get("full_name") });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }
  const { error } = await service
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", ctx.profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

const roleSchema = z.object({
  profile_id: z.string().uuid(),
  role: z.enum(["admin", "paralegal", "attorney"]),
});

export async function updateUserRoleAction(formData: FormData) {
  // Role changes can hand `admin` to anyone in the org — gate behind a
  // fresh MFA assertion so a stolen session cookie can't quietly promote
  // the attacker's account.
  const ctx = await requireStepUpReauth();
  if (ctx.profile.role !== "admin") {
    throw new Error("Only firm admins can change roles");
  }
  const service = getServiceSupabase();
  const parsed = roleSchema.safeParse({
    profile_id: formData.get("profile_id"),
    role: formData.get("role") as ProfileRole | null,
  });
  if (!parsed.success) throw new Error("Invalid input");

  const { error } = await service
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.profile_id)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "user.role_changed",
    entityType: "profile",
    entityId: parsed.data.profile_id,
    metadata: { role: parsed.data.role },
  });
  revalidatePath("/dashboard/settings");
}

const aiSettingsSchema = z.object({
  ai_provider: z.enum(["mock", "local_ocr_only", "huggingface_provider", "huggingface_endpoint"]),
  ocr_engine: z.enum(["tesseract", "paddleocr", "mock", "none"]),
  use_hf_classification: z.boolean(),
  use_hf_explanations: z.boolean(),
  use_hf_vision: z.boolean(),
});

export async function updateAISettingsAction(formData: FormData) {
  const ctx = await requireRole(["admin"]);
  const parsed = aiSettingsSchema.safeParse({
    ai_provider: formData.get("ai_provider") as AIProviderName,
    ocr_engine: formData.get("ocr_engine") as OcrEngineName,
    use_hf_classification: formData.get("use_hf_classification") === "on",
    use_hf_explanations: formData.get("use_hf_explanations") === "on",
    use_hf_vision: formData.get("use_hf_vision") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");

  const service = getServiceSupabase();
  const { error } = await service
    .from("organizations")
    .update({
      ai_provider: parsed.data.ai_provider,
      ai_settings: {
        ocr_engine: parsed.data.ocr_engine,
        use_hf_classification: parsed.data.use_hf_classification,
        use_hf_explanations: parsed.data.use_hf_explanations,
        use_hf_vision: parsed.data.use_hf_vision,
      },
    })
    .eq("id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "organization.ai_settings_updated",
    entityType: "organization",
    entityId: ctx.organization.id,
    metadata: {
      ai_provider: parsed.data.ai_provider,
      ocr_engine: parsed.data.ocr_engine,
      use_hf_classification: parsed.data.use_hf_classification,
      use_hf_explanations: parsed.data.use_hf_explanations,
      use_hf_vision: parsed.data.use_hf_vision,
    },
  });
  revalidatePath("/dashboard/settings");
}
