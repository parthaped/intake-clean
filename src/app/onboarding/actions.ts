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
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; firm_name?: string };

  return {
    userId: data.user.id,
    needsOnboarding: !profile,
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
