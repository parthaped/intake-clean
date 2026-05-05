"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole, requireSession, requireStepUpReauth } from "@/lib/auth";
import { checkMatterQuota } from "@/lib/billing";
import { getServiceSupabase } from "@/lib/supabase/service";

const createSchema = z.object({
  matter_name: z.string().min(2, "Enter a matter name"),
  matter_type: z.enum([
    "immigration",
    "family_law",
    "personal_injury",
    "probate_estate",
    "real_estate",
    "other",
  ]),
  internal_reference: z.string().optional(),
  client_id: z.string().uuid().optional(),
  client_full_name: z.string().optional(),
  client_email: z.string().optional(),
  client_phone: z.string().optional(),
  client_preferred_contact: z.enum(["email", "sms", "both"]).optional(),
});

export async function createMatterAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const quota = await checkMatterQuota({
    organizationId: ctx.organization.id,
    plan: ctx.organization.plan,
    status: ctx.organization.subscription_status,
  });
  if (!quota.allowed) {
    throw new Error(quota.reason ?? "Plan limit reached");
  }

  const parsed = createSchema.safeParse({
    matter_name: formData.get("matter_name"),
    matter_type: formData.get("matter_type"),
    internal_reference: formData.get("internal_reference") || undefined,
    client_id: formData.get("client_id") || undefined,
    client_full_name: formData.get("client_full_name") || undefined,
    client_email: formData.get("client_email") || undefined,
    client_phone: formData.get("client_phone") || undefined,
    client_preferred_contact: (formData.get("client_preferred_contact") as string | null) ?? "email",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }

  let clientId = parsed.data.client_id ?? null;
  if (!clientId) {
    if (!parsed.data.client_full_name || parsed.data.client_full_name.length < 2) {
      throw new Error("Choose an existing client or enter a new client's full name.");
    }
    const { data: newClient, error: clientErr } = await service
      .from("clients")
      .insert({
        organization_id: ctx.organization.id,
        full_name: parsed.data.client_full_name,
        email: parsed.data.client_email || null,
        phone: parsed.data.client_phone || null,
        preferred_contact: parsed.data.client_preferred_contact ?? "email",
      })
      .select("id")
      .single();
    if (clientErr || !newClient) throw new Error(clientErr?.message ?? "Could not create client");
    clientId = newClient.id;
    await recordAudit({
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      action: "client.created",
      entityType: "client",
      entityId: clientId,
      metadata: { label: parsed.data.client_full_name },
    });
  }

  const { data: matter, error } = await service
    .from("matters")
    .insert({
      organization_id: ctx.organization.id,
      client_id: clientId,
      matter_name: parsed.data.matter_name,
      matter_type: parsed.data.matter_type,
      internal_reference: parsed.data.internal_reference || null,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !matter) throw new Error(error?.message ?? "Could not create matter");

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "matter.created",
    entityType: "matter",
    entityId: matter.id,
    metadata: { label: parsed.data.matter_name },
  });

  revalidatePath("/dashboard/matters");
  revalidatePath("/dashboard");
  redirect(`/dashboard/matters/${matter.id}`);
}

const updateStatusSchema = z.object({
  matter_id: z.string().uuid(),
  status: z.enum(["active", "waiting_on_client", "in_review", "ready_to_export", "completed", "archived"]),
});

export async function updateMatterStatusAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const parsed = updateStatusSchema.safeParse({
    matter_id: formData.get("matter_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const { error } = await service
    .from("matters")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.matter_id)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "matter.status_updated",
    entityType: "matter",
    entityId: parsed.data.matter_id,
    metadata: { status: parsed.data.status },
  });
  revalidatePath(`/dashboard/matters/${parsed.data.matter_id}`);
}

const matterIdSchema = z.object({ matter_id: z.string().uuid() });

/**
 * Archives a matter. Reversible — sets `status='archived'` so the matter
 * disappears from the default Matters list and stops counting against the
 * plan quota, but every uploaded file, request, and message is preserved.
 * Use this for "the engagement ended" or "we're done with this case for now".
 */
export async function archiveMatterAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const parsed = matterIdSchema.safeParse({ matter_id: formData.get("matter_id") });
  if (!parsed.success) throw new Error("Invalid matter id");

  const { error } = await service
    .from("matters")
    .update({ status: "archived" })
    .eq("id", parsed.data.matter_id)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "matter.archived",
    entityType: "matter",
    entityId: parsed.data.matter_id,
  });

  revalidatePath("/dashboard/matters");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/matters/${parsed.data.matter_id}`);
}

/**
 * Restores an archived matter back to active. Counterpart to
 * `archiveMatterAction`.
 */
export async function unarchiveMatterAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const parsed = matterIdSchema.safeParse({ matter_id: formData.get("matter_id") });
  if (!parsed.success) throw new Error("Invalid matter id");

  const { error } = await service
    .from("matters")
    .update({ status: "active" })
    .eq("id", parsed.data.matter_id)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "matter.unarchived",
    entityType: "matter",
    entityId: parsed.data.matter_id,
  });

  revalidatePath("/dashboard/matters");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/matters/${parsed.data.matter_id}`);
}

const deleteMatterSchema = z.object({
  matter_id: z.string().uuid(),
  confirm_name: z.string().min(1, "Type the matter name to confirm"),
});

/**
 * Permanently deletes a matter and every related artifact. This is the
 * destructive flow gated for `admin` only and a fresh MFA assertion via
 * `requireStepUpReauth`. The user must also re-type the matter name client-
 * side, which we re-verify server-side.
 *
 * Order of operations matters here:
 *  1. Read every storage path that belongs to this matter (from
 *     `uploaded_files` and `exports`).
 *  2. Remove objects from each bucket. If any bucket-level remove returns an
 *     error we abort _before_ touching the database, so the row still
 *     exists, the storage delete can be retried, and we never end up with
 *     orphaned objects.
 *  3. Delete the matter row. The schema's `on delete cascade` foreign keys
 *     wipe document_requests, document_request_items, uploaded_files,
 *     quality_checks, review_tasks, client_messages, exports, and
 *     processing_jobs in a single round trip.
 *  4. Write an audit log entry. The audit row references `entity_id =
 *     matter.id` but the matter row is gone — that's by design; the log is
 *     the durable proof the deletion happened.
 *
 * We deliberately do NOT touch the `clients` row. The matter FK is
 * `on delete restrict` against clients, but our delete only removes the
 * matter, not the client, so the restrict never fires. A client may have
 * other matters or be re-engaged later.
 */
export async function deleteMatterAction(formData: FormData) {
  const ctx = await requireRole(["admin"]);
  await requireStepUpReauth();
  const service = getServiceSupabase();

  const parsed = deleteMatterSchema.safeParse({
    matter_id: formData.get("matter_id"),
    confirm_name: formData.get("confirm_name"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }

  const { data: matter, error: matterErr } = await service
    .from("matters")
    .select("id, matter_name, internal_reference, client_id, clients(full_name)")
    .eq("id", parsed.data.matter_id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle<{
      id: string;
      matter_name: string;
      internal_reference: string | null;
      client_id: string;
      clients: { full_name: string } | null;
    }>();
  if (matterErr) throw new Error(matterErr.message);
  if (!matter) throw new Error("Matter not found");

  // Re-typed name has to match exactly (case-insensitive, trimmed). This is
  // the same UX every "destructive delete" dialog uses (GitHub, Stripe, etc.)
  // and prevents fat-finger deletions when an admin is moving fast.
  if (parsed.data.confirm_name.trim().toLowerCase() !== matter.matter_name.trim().toLowerCase()) {
    throw new Error("Matter name did not match");
  }

  const [filesRes, exportsRes] = await Promise.all([
    service
      .from("uploaded_files")
      .select("original_storage_path, processed_storage_path, thumbnail_storage_path")
      .eq("matter_id", matter.id),
    service
      .from("exports")
      .select("storage_path")
      .eq("matter_id", matter.id),
  ]);
  if (filesRes.error) throw new Error(filesRes.error.message);
  if (exportsRes.error) throw new Error(exportsRes.error.message);

  const originalKeys: string[] = [];
  const processedKeys: string[] = [];
  const thumbnailKeys: string[] = [];
  for (const row of filesRes.data ?? []) {
    if (row.original_storage_path) originalKeys.push(row.original_storage_path);
    if (row.processed_storage_path) processedKeys.push(row.processed_storage_path);
    if (row.thumbnail_storage_path) thumbnailKeys.push(row.thumbnail_storage_path);
  }
  const exportKeys = (exportsRes.data ?? []).map((r) => r.storage_path).filter(Boolean);

  const removals: Array<Promise<{ error: unknown }>> = [];
  if (originalKeys.length) {
    removals.push(service.storage.from("original-documents").remove(originalKeys));
  }
  if (processedKeys.length) {
    removals.push(service.storage.from("processed-documents").remove(processedKeys));
  }
  if (thumbnailKeys.length) {
    removals.push(service.storage.from("thumbnails").remove(thumbnailKeys));
  }
  if (exportKeys.length) {
    removals.push(service.storage.from("exports").remove(exportKeys));
  }

  const removeResults = await Promise.all(removals);
  for (const r of removeResults) {
    if (r.error) {
      const msg = r.error instanceof Error ? r.error.message : String(r.error);
      throw new Error(`Storage cleanup failed; matter not deleted (${msg})`);
    }
  }

  const { error: deleteErr } = await service
    .from("matters")
    .delete()
    .eq("id", matter.id)
    .eq("organization_id", ctx.organization.id);
  if (deleteErr) throw new Error(deleteErr.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "matter.deleted",
    entityType: "matter",
    entityId: matter.id,
    metadata: {
      label: matter.matter_name,
      internal_reference: matter.internal_reference,
      client_name: matter.clients?.full_name ?? null,
      file_count: filesRes.data?.length ?? 0,
      export_count: exportsRes.data?.length ?? 0,
    },
  });

  revalidatePath("/dashboard/matters");
  revalidatePath("/dashboard");
  redirect("/dashboard/matters");
}
