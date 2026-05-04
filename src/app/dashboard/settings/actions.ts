"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole, requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { ProfileRole } from "@/types/database";

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
  const ctx = await requireRole(["admin"]);
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
