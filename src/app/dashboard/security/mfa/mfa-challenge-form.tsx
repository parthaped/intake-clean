"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Elevates the current session to AAL2 by completing a TOTP challenge
 * against the user's already-verified factor. We pick the first verified
 * TOTP factor; users that have multiple authenticators can re-enroll the
 * one they want to use.
 */
export function MfaChallengeForm() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: factors, error: factorErr } = await supabase.auth.mfa.listFactors();
      if (factorErr) throw new Error(factorErr.message);
      const factor = (factors?.totp ?? []).find((f) => (f.status as string) === "verified");
      if (!factor) throw new Error("No verified authenticator. Enroll one above first.");
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chalErr || !challenge) throw new Error(chalErr?.message ?? "Could not start challenge");
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyErr) throw new Error(verifyErr.message);
      toast.success("Verified. Reloading…");
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="challenge_code">Authenticator code</Label>
        <Input
          id="challenge_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
      </div>
      <Button type="submit" disabled={pending || code.length !== 6}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Verify
      </Button>
    </form>
  );
}
