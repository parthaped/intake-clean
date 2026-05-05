"use server";

import { redirect } from "next/navigation";

import { bootstrapOrganization } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function getOnboardingNeed() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { userId: null, needsOnboarding: false, suggestedName: "", suggestedFirmName: "" };
  }

  const service = getServiceSupabase();
  const { data: profile } = await service
    .from("profiles")
    .select("id, organization_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  // Defensive: a profile pointing at a deleted organization is normally
  // impossible thanks to ON DELETE CASCADE, but it can happen via partial
  // seeds or admin scripts. If we returned `needsOnboarding=false` here,
  // the page would redirect to /dashboard, where requireSession would see
  // a missing org and bounce back to /onboarding — an infinite loop.
  let hasUsableOrganization = false;
  if (profile) {
    const { data: org } = await service
      .from("organizations")
      .select("id")
      .eq("id", profile.organization_id)
      .maybeSingle();
    hasUsableOrganization = Boolean(org);
  }

  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; firm_name?: string };

  return {
    userId: data.user.id,
    needsOnboarding: !profile || !hasUsableOrganization,
    suggestedName: meta.full_name ?? "",
    suggestedFirmName: meta.firm_name ?? "",
  };
}

export async function completeOnboarding(formData: FormData) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const firmName = String(formData.get("firmName") ?? "").trim();

  if (fullName.length < 2 || firmName.length < 2) {
    throw new Error("Please enter your name and firm name.");
  }

  await bootstrapOrganization({
    userId: data.user.id,
    fullName,
    firmName,
    email: data.user.email ?? null,
  });

  redirect("/dashboard");
}
