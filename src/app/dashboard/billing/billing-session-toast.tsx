"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Reads `?session=success|cancelled` (set by Stripe checkout's
 * success_url / cancel_url) and surfaces a toast, then strips the param
 * so a refresh doesn't re-fire it.
 */
export function BillingSessionToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = params.get("session");
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    if (firedFor.current === session) return;
    firedFor.current = session;

    if (session === "success") {
      toast.success("Subscription started", {
        description:
          "We're confirming the payment with Stripe. Plan limits will refresh in a moment.",
      });
    } else if (session === "cancelled") {
      toast("Checkout cancelled", {
        description: "No changes were made to your subscription.",
      });
    }

    const next = new URLSearchParams(params.toString());
    next.delete("session");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [session, params, pathname, router]);

  return null;
}
