import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceSupabase } from "@/lib/supabase/service";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import type { Database } from "@/types/database";

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
 * templates into the new org. Idempotent: if the user already has a profile
 * pointing at a still-existing organization, returns the existing IDs
 * instead of creating duplicates. If the profile is orphaned (org row was
 * removed), the profile is re-pointed at a freshly-created organization to
 * avoid the dashboard <-> onboarding redirect loop.
 */
export async function bootstrapOrganization(input: OnboardingInput): Promise<OnboardingResult> {
  const service = getServiceSupabase();

  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, organization_id")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingOrg } = await service
      .from("organizations")
      .select("id")
      .eq("id", existingProfile.organization_id)
      .maybeSingle();
    if (existingOrg) {
      return {
        organizationId: existingProfile.organization_id,
        profileId: existingProfile.id,
      };
    }
    // Fall through: create a new org below and re-point the profile at it.
  }

  // Reserve a slug + insert the org row inside a small retry loop. The
  // SELECT-then-INSERT in `reserveOrganizationSlug` is inherently TOCTOU:
  // a concurrent onboarding submission can pick the same slug between the
  // SELECT (sees free) and our INSERT (claims it). The unique constraint
  // catches it as a 23505; we just need to pick a different candidate and
  // try again rather than 500ing the staff member.
  const SLUG_RETRY_BUDGET = 5;
  let organization: Database["public"]["Tables"]["organizations"]["Row"] | null = null;
  let lastSlugError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < SLUG_RETRY_BUDGET; attempt += 1) {
    const slug = await reserveOrganizationSlug(service, input.firmName, input.userId);
    const { data, error: orgError } = await service
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
    if (data && !orgError) {
      organization = data;
      break;
    }
    if (orgError?.code === "23505") {
      // Slug raced — try the next candidate. We deliberately don't fall
      // back to the timestamp-suffixed variant on the very first 23505 so
      // we don't permanently scar the URL of an org just because of a
      // single concurrent submit.
      lastSlugError = { message: orgError.message, code: orgError.code };
      continue;
    }
    throw new Error(orgError?.message ?? "Could not create organization");
  }
  if (!organization) {
    throw new Error(
      lastSlugError?.message ?? "Could not reserve a unique organization slug after multiple attempts",
    );
  }

  let profileId: string;
  if (existingProfile) {
    // Repair path: keep the profile row, just point it at the new org and
    // refresh full_name/role to the values from this onboarding submission.
    const { data: repaired, error: repairError } = await service
      .from("profiles")
      .update({
        organization_id: organization.id,
        full_name: input.fullName,
        role: "admin",
      })
      .eq("id", existingProfile.id)
      .select("id")
      .single();
    if (repairError || !repaired) {
      throw new Error(repairError?.message ?? "Could not repair profile");
    }
    profileId = repaired.id;
  } else {
    const { data: created, error: profileError } = await service
      .from("profiles")
      .insert({
        user_id: input.userId,
        organization_id: organization.id,
        full_name: input.fullName,
        role: "admin",
      })
      .select("id")
      .single();
    if (profileError || !created) {
      // Concurrent submit (e.g., double-click after our existingProfile
      // check) trips the user_id unique constraint. Re-read the winning
      // row, drop the org we just created so we don't leak orphans, and
      // hand back the winner's IDs.
      if (profileError?.code === "23505") {
        const { data: winner } = await service
          .from("profiles")
          .select("id, organization_id")
          .eq("user_id", input.userId)
          .maybeSingle();
        if (winner) {
          await service.from("organizations").delete().eq("id", organization.id);
          return {
            organizationId: winner.organization_id,
            profileId: winner.id,
          };
        }
      }
      throw new Error(profileError?.message ?? "Could not create profile");
    }
    profileId = created.id;
  }

  await copyGlobalTemplatesIntoOrg(organization.id, profileId);

  await recordAudit({
    organizationId: organization.id,
    actorProfileId: profileId,
    actorType: "staff",
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    metadata: { firmName: input.firmName, email: input.email },
  });

  return { organizationId: organization.id, profileId };
}

/**
 * Picks a slug that's free at the time of return. The caller must still
 * handle the (very rare) TOCTOU race where another writer claims the slug
 * between this lookup and the actual INSERT. The fallback list includes a
 * userId-prefixed variant and finally a timestamp-suffixed variant, so we
 * almost never run out of candidates even in adversarial cases.
 */
async function reserveOrganizationSlug(
  service: SupabaseClient<Database>,
  firmName: string,
  userId: string,
): Promise<string> {
  const baseSlug = slugify(firmName) || `firm-${userId.slice(0, 8)}`;
  const candidates: string[] = [baseSlug];
  for (let i = 1; i <= 25; i += 1) {
    candidates.push(`${baseSlug}-${i}`);
  }
  candidates.push(`${baseSlug}-${userId.slice(0, 8)}`);

  for (const candidate of candidates) {
    const { data: clash } = await service
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
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
