import "server-only";

import { redirect } from "next/navigation";

import { MFA_REQUIRED_ROLES, checkMfaForRole } from "@/lib/security/mfa";
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
  // Privileged roles must satisfy MFA. We check against the user's *effective*
  // role, not the requested-role list, so an admin doesn't get a free pass
  // when calling code that only requires `paralegal`.
  if (MFA_REQUIRED_ROLES.has(ctx.profile.role)) {
    const mfa = await checkMfaForRole(ctx.profile.role);
    if (!mfa.ok) {
      const target = mfa.reason === "needs_enrollment" ? "/dashboard/security/mfa?reason=enroll" : "/dashboard/security/mfa?reason=challenge";
      redirect(target);
    }
  }
  return ctx;
}

/**
 * Same as `requireSession` but additionally enforces MFA when the caller's
 * profile role requires it. Use this on server components / actions that
 * gate access to documents containing PII (passports, SSNs).
 */
export async function requireSessionWithMfa(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (MFA_REQUIRED_ROLES.has(ctx.profile.role)) {
    const mfa = await checkMfaForRole(ctx.profile.role);
    if (!mfa.ok) {
      const target = mfa.reason === "needs_enrollment" ? "/dashboard/security/mfa?reason=enroll" : "/dashboard/security/mfa?reason=challenge";
      redirect(target);
    }
  }
  return ctx;
}

/**
 * Step-up reauth gate. Same as `requireSessionWithMfa` but additionally
 * requires a fresh MFA assertion (within the last 15 minutes). Use this on:
 *
 *   - org delete
 *   - billing-plan change / Stripe checkout / Stripe portal
 *   - packet exports (PDF, ZIP, missing-report)
 *   - team-role changes
 *
 * For `paralegal` and other non-MFA-required roles this falls back to
 * `requireSession` semantics — the freshness check only applies when the
 * role already has to satisfy MFA.
 */
export async function requireStepUpReauth(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!MFA_REQUIRED_ROLES.has(ctx.profile.role)) return ctx;
  const mfa = await checkMfaForRole(ctx.profile.role, { requireFreshness: true });
  if (mfa.ok) return ctx;
  const reasonParam =
    mfa.reason === "needs_enrollment"
      ? "enroll"
      : mfa.reason === "needs_freshness"
        ? "stepup"
        : "challenge";
  redirect(`/dashboard/security/mfa?reason=${reasonParam}`);
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
