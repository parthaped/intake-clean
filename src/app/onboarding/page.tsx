import { redirect } from "next/navigation";

import { getOnboardingNeed } from "@/app/onboarding/actions";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const need = await getOnboardingNeed();
  if (!need.userId) redirect("/login");
  if (!need.needsOnboarding) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="container py-6">
        <BrandMark />
      </header>
      <main className="container max-w-xl py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Set up your firm</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us your firm name and we&apos;ll create your workspace with the default checklist
          templates pre-loaded.
        </p>
        <div className="mt-8">
          <OnboardingForm defaultName={need.suggestedName} defaultFirm={need.suggestedFirmName} />
        </div>
      </main>
    </div>
  );
}
