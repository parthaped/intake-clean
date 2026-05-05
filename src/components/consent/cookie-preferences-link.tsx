"use client";

import { useConsent } from "@/lib/consent/client";

/**
 * Footer affordance that re-opens the granular consent modal. Rendered
 * inside `MarketingShell` alongside the other legal links.
 *
 * Styled as a plain link rather than a button so it visually matches the
 * other footer items.
 */
export function CookiePreferencesLink({ className }: { className?: string }) {
  const { openModal } = useConsent();
  return (
    <button
      type="button"
      onClick={openModal}
      className={
        className ??
        "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      }
    >
      Cookie preferences
    </button>
  );
}
