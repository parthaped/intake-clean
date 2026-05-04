import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";

export interface OnboardingInput {
  userId: string;
  fullName: string;
  firmName: string;
  email: string | null;
}

export interface OnboardingResult {
  organizationId: string;
  profileId: string;
}

/**
 * Creates an organization, the admin profile, and copies global checklist
 * templates into the new org. Idempotent: if the user already has a profile,
 * returns the existing IDs instead of creating duplicates.
 */
export async function bootstrapOrganization(input: OnboardingInput): Promise<OnboardingResult> {
  const service = getServiceSupabase();

  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, organization_id")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingProfile) {
    return {
      organizationId: existingProfile.organization_id,
      profileId: existingProfile.id,
    };
  }

  const baseSlug = slugify(input.firmName) || `firm-${input.userId.slice(0, 8)}`;
  let slug = baseSlug;
  for (let i = 1; i < 25; i++) {
    const { data: clash } = await service
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data: organization, error: orgError } = await service
    .from("organizations")
    .insert({
      name: input.firmName,
      slug,
      plan: "starter",
      subscription_status: "trialing",
      storage_limit_mb: 5120,
    })
    .select("*")
    .single();
  if (orgError || !organization) {
    throw new Error(orgError?.message ?? "Could not create organization");
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .insert({
      user_id: input.userId,
      organization_id: organization.id,
      full_name: input.fullName,
      role: "admin",
    })
    .select("*")
    .single();
  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Could not create profile");
  }

  await copyGlobalTemplatesIntoOrg(organization.id, profile.id);

  await recordAudit({
    organizationId: organization.id,
    actorProfileId: profile.id,
    actorType: "staff",
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    metadata: { firmName: input.firmName, email: input.email },
  });

  return { organizationId: organization.id, profileId: profile.id };
}

async function copyGlobalTemplatesIntoOrg(organizationId: string, createdBy: string) {
  const service = getServiceSupabase();
  const { data: templates } = await service
    .from("checklist_templates")
    .select("*")
    .eq("is_global", true);
  if (!templates) return;

  for (const template of templates) {
    const { data: copy } = await service
      .from("checklist_templates")
      .insert({
        organization_id: organizationId,
        name: template.name,
        matter_type: template.matter_type,
        description: template.description,
        is_global: false,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (!copy) continue;

    const { data: items } = await service
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", template.id)
      .order("sort_order", { ascending: true });
    if (!items?.length) continue;

    await service.from("checklist_template_items").insert(
      items.map((item) => ({
        template_id: copy.id,
        title: item.title,
        description: item.description,
        required: item.required,
        accepted_file_types: item.accepted_file_types,
        sort_order: item.sort_order,
      })),
    );
  }
}
