"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { generateRequestToken } from "@/lib/tokens";
import { getServiceSupabase } from "@/lib/supabase/service";

const itemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(true),
});
const schema = z.object({
  matter_id: z.string().uuid(),
  title: z.string().min(2),
  message_to_client: z.string().optional(),
  template_id: z.string().uuid().optional(),
  expires_at: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export async function createRequestAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const itemsRaw = formData.get("items_json");
  const items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : [];

  const parsed = schema.safeParse({
    matter_id: formData.get("matter_id"),
    title: formData.get("title"),
    message_to_client: formData.get("message_to_client") || undefined,
    template_id: formData.get("template_id") || undefined,
    expires_at: formData.get("expires_at") || undefined,
    items,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }

  const { data: matter } = await service
    .from("matters")
    .select("id, client_id, organization_id")
    .eq("id", parsed.data.matter_id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!matter) throw new Error("Matter not found");

  const token = generateRequestToken();
  const { data: request, error } = await service
    .from("document_requests")
    .insert({
      organization_id: ctx.organization.id,
      matter_id: matter.id,
      client_id: matter.client_id,
      title: parsed.data.title,
      message_to_client: parsed.data.message_to_client ?? null,
      token,
      status: "draft",
      expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at).toISOString() : null,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !request) throw new Error(error?.message ?? "Could not create request");

  await service.from("document_request_items").insert(
    parsed.data.items.map((item, idx) => ({
      request_id: request.id,
      title: item.title,
      description: item.description ?? null,
      required: item.required,
      sort_order: idx,
    })),
  );

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "request.created",
    entityType: "document_request",
    entityId: request.id,
    metadata: { label: parsed.data.title, item_count: parsed.data.items.length },
  });

  revalidatePath(`/dashboard/matters/${matter.id}`);
  redirect(`/dashboard/matters/${matter.id}?tab=checklist&request=${request.id}`);
}
