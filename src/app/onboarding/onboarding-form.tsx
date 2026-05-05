"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNextRedirectError } from "@/lib/utils";
import { completeOnboarding } from "@/app/onboarding/actions";

interface OnboardingFormProps {
  defaultName: string;
  defaultFirm: string;
}

export function OnboardingForm({ defaultName, defaultFirm }: OnboardingFormProps) {
  const [pending, startTransition] = useTransition();

  function handleAction(formData: FormData) {
    startTransition(async () => {
      try {
        await completeOnboarding(formData);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Could not finish setup");
      }
    });
  }

  return (
    <form action={handleAction} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Your name</Label>
        <Input id="fullName" name="fullName" defaultValue={defaultName} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="firmName">Firm name</Label>
        <Input id="firmName" name="firmName" defaultValue={defaultFirm} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create workspace
      </Button>
    </form>
  );
}
