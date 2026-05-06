"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole, requireSession, requireStepUpReauth } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { AIProviderName, OcrEngineName, ProfileRole } from "@/types/database";

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
