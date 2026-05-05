import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { MFA_REQUIRED_ROLES, checkMfaForRole } from "@/lib/security/mfa";

import { MfaChallengeForm } from "./mfa-challenge-form";
import { MfaEnrollForm } from "./mfa-enroll-form";

interface PageProps {
  searchParams: Promise<{ reason?: string }>;
}

export default async function MfaPage({ searchParams }: PageProps) {
  // Don't use requireSessionWithMfa here — we ARE the page that lets users
  // satisfy MFA, so requiring MFA to load it would be a redirect loop.
  const ctx = await requireSession();
  const params = await searchParams;
  const state = await checkMfaForRole(ctx.profile.role);
  const required = MFA_REQUIRED_ROLES.has(ctx.profile.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> Multi-factor authentication
        </h1>
        <p className="text-muted-foreground">
          {required
            ? "Your role can access client documents containing passports and SSNs. MFA is required."
            : "MFA is optional for your role today, but strongly recommended."}
        </p>
      </div>

      {!state.ok && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">Action required</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {params.reason === "stepup" && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">Re-verify before continuing</p>
            <p>This action requires a fresh MFA confirmation (within the last 15 minutes).</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Enroll an authenticator app</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Use 1Password, Authy, Google Authenticator, or any other TOTP-compatible app. After scanning the QR code,
            enter the 6-digit code to confirm enrollment.
          </p>
          <MfaEnrollForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verify a code (this session)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            If you already enrolled, enter the current 6-digit code from your authenticator to elevate this session
            to {params.reason === "challenge" ? "the level required by your role." : "AAL2."}
          </p>
          <MfaChallengeForm />
        </CardContent>
      </Card>
    </div>
  );
}
