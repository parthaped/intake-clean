import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Note: per-page MFA enforcement happens via `requireRole()` /
  // `requireSessionWithMfa()` on the sensitive surfaces (settings, billing,
  // exports). Doing it here would either let everything through, or trap
  // un-enrolled users in a redirect loop with the MFA enrollment page (which
  // also lives under /dashboard).
  const ctx = await requireSession();
  return (
    <AppShell
      user={{ fullName: ctx.profile.full_name, email: ctx.email, role: ctx.profile.role }}
      organization={{
        name: ctx.organization.name,
        plan: ctx.organization.plan,
        subscriptionStatus: ctx.organization.subscription_status,
      }}
    >
      {children}
    </AppShell>
  );
}
