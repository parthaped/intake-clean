"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
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
