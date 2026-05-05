import { History, ShieldCheck, AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatDateTime } from "@/lib/utils";
import type { ProfileRole } from "@/types/database";

export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  full_name: string;
  role: ProfileRole;
  created_at: string;
  email?: string | null;
}

interface AdminAuthRow {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  factors?: Array<{ status?: string }>;
}

interface RoleChangeRow {
  id: string;
  action: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

const STALE_DAYS = 90;

/**
 * Quarterly access-review surface for firm admins. Shows three things:
 *
 *   1. Every staff member, with their role, MFA-enrolment state, and the
 *      last time they signed in. Anyone who hasn't signed in for 90+ days
 *      is flagged for off-boarding consideration.
 *   2. Recent role-change events from the audit log so the admin can spot
 *      privilege drift (for example, an attorney upgraded to admin without
 *      a paper trail).
 *   3. A single "next review due" pill that nudges quarterly cadence.
 *
 * Only `admin` users can reach this page; `requireRole` plus the parent
 * `requireSessionWithMfa` (via the layout guidance in `dashboard/layout.tsx`)
 * keep that promise honest.
 */
export default async function AccessReviewPage() {
  const ctx = await requireRole(["admin"]);
  const service = getServiceSupabase();

  const { data: members } = await service
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });
  const memberRows = (members ?? []) as MemberRow[];

  // Pull auth metadata in batches via the admin endpoint. We pull all users
  // and filter client-side since we only display the org's own profiles.
  const { data: authList } = await service.auth.admin.listUsers({ perPage: 200 });
  const authById = new Map<string, AdminAuthRow>();
  for (const user of authList?.users ?? []) {
    const factors = ((user as unknown as { factors?: AdminAuthRow["factors"] }).factors) ?? [];
    authById.set(user.id, {
      id: user.id,
      email: user.email ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      banned_until: (user as unknown as { banned_until?: string | null }).banned_until ?? null,
      factors,
    });
  }

  const decorated = memberRows.map((row) => {
    const auth = authById.get(row.id);
    const lastSignIn = auth?.last_sign_in_at ? new Date(auth.last_sign_in_at) : null;
    const staleDays = lastSignIn
      ? Math.floor((Date.now() - lastSignIn.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const mfaEnrolled = (auth?.factors ?? []).some((f) => f.status === "verified");
    return {
      ...row,
      email: auth?.email ?? null,
      lastSignIn,
      staleDays,
      mfaEnrolled,
      banned: Boolean(auth?.banned_until),
    };
  });

  const stale = decorated.filter((m) => m.staleDays !== null && m.staleDays >= STALE_DAYS);
  const missingMfa = decorated.filter(
    (m) => (m.role === "admin" || m.role === "attorney") && !m.mfaEnrolled,
  );

  const { data: roleChanges } = await service
    .from("audit_logs")
    .select("id, action, entity_id, metadata, created_at, profiles:actor_profile_id(full_name)")
    .eq("organization_id", ctx.organization.id)
    .eq("action", "user.role_changed")
    .order("created_at", { ascending: false })
    .limit(50);
  const roleChangeRows = (roleChanges ?? []) as unknown as RoleChangeRow[];

  // Quarterly cadence: next review due = first of the next quarter.
  const now = new Date();
  const nextQuarterMonth = Math.floor(now.getMonth() / 3) * 3 + 3;
  const nextReview = new Date(now.getFullYear(), nextQuarterMonth, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" /> Access review
          </h1>
          <p className="text-muted-foreground">
            Quarterly review of who can sign in to {ctx.organization.name}, what role they hold, and whether they
            have MFA enrolled. Run this on the first business day of every quarter and document the outcome.
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          Next review due: {formatDateTime(nextReview.toISOString())}
        </Badge>
      </div>

      {(stale.length > 0 || missingMfa.length > 0) && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" /> Action items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {stale.length > 0 && (
              <p>
                <strong>{stale.length}</strong> account
                {stale.length === 1 ? " has" : "s have"} not signed in for {STALE_DAYS}+ days. Off-board if no
                longer needed.
              </p>
            )}
            {missingMfa.length > 0 && (
              <p>
                <strong>{missingMfa.length}</strong> privileged account
                {missingMfa.length === 1 ? " is" : "s are"} missing MFA enrollment.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {decorated.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{member.full_name}</p>
                  <p className="text-xs text-muted-foreground">{member.email ?? "no email on file"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {member.role}
                  </Badge>
                  <Badge variant={member.mfaEnrolled ? "outline" : "destructive"}>
                    MFA: {member.mfaEnrolled ? "yes" : "missing"}
                  </Badge>
                  <Badge variant="outline">
                    Last sign-in:{" "}
                    {member.lastSignIn
                      ? `${member.staleDays} day${member.staleDays === 1 ? "" : "s"} ago`
                      : "never"}
                  </Badge>
                  {member.banned && <Badge variant="destructive">Suspended</Badge>}
                </div>
              </li>
            ))}
            {decorated.length === 0 && <li className="py-6 text-muted-foreground">No team members yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent role changes</CardTitle>
        </CardHeader>
        <CardContent>
          {roleChangeRows.length === 0 ? (
            <EmptyState
              Icon={History}
              title="No role changes in the last 50 audit events"
              description="If someone's role changed and you don't see it here, escalate immediately."
            />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {roleChangeRows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p>
                      {row.profiles?.full_name ?? "Unknown actor"} changed a role to{" "}
                      <Badge variant="outline" className="capitalize">
                        {String(row.metadata?.role ?? "unknown")}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
