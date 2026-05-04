"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

const itemSchema = z.object({
  title: z.string().min(2, "Each item needs a title"),
  description: z.string().optional(),
  required: z.boolean().default(true),
});
const schema = z.object({
  name: z.string().min(2, "Name the template"),
  matter_type: z.enum(["immigration", "family_law", "personal_injury", "probate_estate", "real_estate", "other"]),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
});

export async function createTemplateAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const itemsRaw = formData.get("items_json");
  const items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : [];

  const parsed = schema.safeParse({
    name: formData.get("name"),
    matter_type: formData.get("matter_type"),
    description: formData.get("description") || undefined,
    items,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
  }

  const { data: template, error } = await service
    .from("checklist_templates")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name,
      matter_type: parsed.data.matter_type,
      description: parsed.data.description ?? null,
      is_global: false,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !template) throw new Error(error?.message ?? "Could not create template");

  await service.from("checklist_template_items").insert(
    parsed.data.items.map((item, idx) => ({
      template_id: template.id,
      title: item.title,
      description: item.description ?? null,
      required: item.required,
      sort_order: idx,
    })),
  );

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "template.created",
    entityType: "checklist_template",
    entityId: template.id,
    metadata: { label: parsed.data.name, item_count: parsed.data.items.length },
  });

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const id = String(formData.get("template_id") ?? "");
  if (!id) throw new Error("Missing template id");

  const { error } = await service
    .from("checklist_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "template.deleted",
    entityType: "checklist_template",
    entityId: id,
  });

  revalidatePath("/dashboard/templates");
}
