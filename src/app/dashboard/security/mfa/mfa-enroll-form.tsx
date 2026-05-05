"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/supabase/client";

const FACTOR_FRIENDLY_NAME = "IntakeClean staff";

/**
 * Client-side TOTP enrollment using Supabase MFA. The browser SDK calls
 * supabase.auth.mfa.enroll() to mint a new (unverified) factor and returns
 * the otpauth URL + an SVG QR code; the user scans it with their app and
 * confirms the 6-digit code. Once verified, future sessions can satisfy the
 * `aal2` requirement by completing a challenge with this factor.
 */
export function MfaEnrollForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [hasVerifiedFactor, setHasVerifiedFactor] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  // Guards against React 18 StrictMode invoking the effect twice in dev,
  // which would race two enroll() calls and surface a duplicate friendly-
  // name error from GoTrue.
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    let cancelled = false;
    async function init() {
      const supabase = getBrowserSupabase();
      try {
        const { data: existing, error: listErr } = await supabase.auth.mfa.listFactors();
        if (listErr) throw new Error(listErr.message);

        const totp = existing?.totp ?? [];
        const verified = totp.find((f) => (f.status as string) === "verified");
        if (verified) {
          if (!cancelled) setHasVerifiedFactor(true);
          return;
        }

        // Clean up any leftover unverified factors before enrolling a new
        // one. Supabase only returns the QR / secret on the initial enroll
        // call, and re-calling enroll() with the same friendlyName fails
        // with "A factor with the friendly name '<name>' for this user
        // already exists." Unenrolling stale factors lets the user always
        // get a fresh QR if they bailed mid-enrollment last time.
        const stale = totp.filter((f) => (f.status as string) !== "verified");
        for (const factor of stale) {
          const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollErr) throw new Error(unenrollErr.message);
        }

        if (cancelled) return;

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: FACTOR_FRIENDLY_NAME,
        });
        if (error) throw new Error(error.message);
        if (!cancelled && data) {
          setFactorId(data.id);
          setQr(data.totp.qr_code);
          setSecret(data.totp.secret);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not start MFA enrollment");
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    setPending(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chalErr || !challenge) throw new Error(chalErr?.message ?? "Could not start challenge");
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyErr) throw new Error(verifyErr.message);
      toast.success("MFA enrolled. You'll be asked for a code next time you sign in.");
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setPending(false);
    }
  }

  if (initializing) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Generating QR code…
      </p>
    );
  }

  if (hasVerifiedFactor) {
    return (
      <p className="text-sm text-muted-foreground">
        You already have a verified authenticator enrolled. Visit your authenticator app for codes.
      </p>
    );
  }

  if (!qr) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not start MFA enrollment. Refresh the page to try again, or contact support if the
        problem persists.
      </p>
    );
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onConfirm}>
      <div className="space-y-2">
        <Label>1. Scan with your authenticator app</Label>
        {/* Supabase returns a data:image/svg+xml URL we can render directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="MFA QR code" className="rounded-xl border border-border bg-white p-2" width={192} height={192} />
        {secret && (
          <p className="text-xs text-muted-foreground">
            Or paste this secret manually: <code className="font-mono">{secret}</code>
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="enroll_code">2. Enter the 6-digit code</Label>
        <Input
          id="enroll_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
        <Button type="submit" disabled={pending || code.length !== 6}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm enrollment
        </Button>
      </div>
    </form>
  );
}
