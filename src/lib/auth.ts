import "server-only";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { ProfileRole, Tables } from "@/types/database";

export interface SessionContext {
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
  organization: Tables<"organizations">;
}

/**
 * Loads the active session + profile + organization for a Server Component or
 * server action. Redirects to /login when there is no session and to
 * /onboarding when the user is signed in but does not yet have a profile.
 */
export async function requireSession(options: { allowMissingProfile?: boolean } = {}): Promise<SessionContext> {
  const supabase = await getServerSupabase();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    redirect("/login");
  }

  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("*")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (!profile) {
    if (options.allowMissingProfile) {
      return {
        userId: userResult.user.id,
        email: userResult.user.email ?? null,
        // Caller must check before using these.
        profile: null as unknown as Tables<"profiles">,
        organization: null as unknown as Tables<"organizations">,
      };
    }
    redirect("/onboarding");
  }

  const { data: organization } = await service
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .maybeSingle();

  if (!organization) {
    redirect("/onboarding");
  }

  return {
    userId: userResult.user.id,
    email: userResult.user.email ?? null,
    profile,
    organization,
  };
}

export async function requireRole(roles: ProfileRole[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!roles.includes(ctx.profile.role)) {
    redirect("/dashboard?denied=1");
  }
  return ctx;
}

export async function getOptionalSession(): Promise<SessionContext | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const service = getServiceSupabase();
  const { data: profile } = await service
    .from("profiles")
    .select("*")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: organization } = await service
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .maybeSingle();
  if (!organization) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    profile,
    organization,
  };
}
