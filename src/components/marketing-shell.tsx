import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { CookiePreferencesLink } from "@/components/consent/cookie-preferences-link";
import { Button } from "@/components/ui/button";
import { ConsentProvider } from "@/lib/consent/client";
import { loadConsentForRequest } from "@/lib/consent/server";
import { DISCLAIMER_LINES } from "@/lib/constants";

export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const { record, region, requiresPrompt } = await loadConsentForRequest();

  return (
    <ConsentProvider
      initialRecord={record}
      initialRegion={region}
      initialRequiresPrompt={requiresPrompt}
    >
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex items-center justify-between py-3.5">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <BrandMark />
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Button variant="ghost" asChild>
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Start free</Link>
              </Button>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border/60 bg-secondary/30">
          <div className="container space-y-4 py-10 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BrandMark />
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <Link href="/legal/terms-of-service" className="hover:text-foreground">
                  Terms
                </Link>
                <Link href="/legal/privacy-policy" className="hover:text-foreground">
                  Privacy
                </Link>
                <Link href="/legal/data-processing-addendum" className="hover:text-foreground">
                  DPA
                </Link>
                <Link href="/legal/subprocessor-list" className="hover:text-foreground">
                  Subprocessors
                </Link>
                <Link href="/legal" className="hover:text-foreground">
                  All legal
                </Link>
                <CookiePreferencesLink className="text-xs hover:text-foreground" />
              </nav>
              <p>&copy; {new Date().getFullYear()} IntakeClean</p>
            </div>
            <div className="space-y-1 text-xs">
              {DISCLAIMER_LINES.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </footer>
        <ConsentBanner />
      </div>
    </ConsentProvider>
  );
}
