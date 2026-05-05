"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useConsent } from "@/lib/consent/client";

import { ConsentModal } from "./consent-modal";

/**
 * First-paint cookie consent banner.
 *
 * Equally-weighted "Only essential" and "Accept all" buttons (matching
 * EDPB 03/2022 guidance + recent CNIL enforcement). A tertiary
 * "Customize" link opens the per-category modal.
 *
 * The banner only renders when `bannerOpen` is true. The server-side
 * bootstrap in `MarketingShell` ensures we don't show it to users who
 * already have a recorded decision, so there's no hydration flash.
 */
export function ConsentBanner() {
  const { bannerOpen, openModal, acceptAll, essentialOnly } = useConsent();

  return (
    <>
      <ConsentModal />
      {bannerOpen ? (
        <div
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">We use a small set of cookies.</p>
              <p className="text-muted-foreground">
                Strictly-necessary cookies keep you signed in. Optional cookies remember
                preferences or help us measure usage. We do not run cross-site advertising.{" "}
                <Link
                  href="/legal/cookie-notice"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Cookie Notice
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={openModal}
                className="text-xs"
              >
                Customize
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={essentialOnly}
                className="min-w-[8.5rem]"
              >
                Only essential
              </Button>
              <Button
                size="sm"
                onClick={acceptAll}
                className="min-w-[8.5rem]"
              >
                Accept all
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
