import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { loadConsentForRequest } from "@/lib/consent/server";

export const metadata: Metadata = {
  title: "Cookie preferences — IntakeClean",
  description:
    "Choose which optional cookies IntakeClean may set in your browser. Strictly-necessary cookies cannot be disabled because the product will not function without them.",
  alternates: { canonical: "/legal/cookie-preferences" },
};

interface PageProps {
  searchParams: Promise<{ saved?: string }>;
}

/**
 * No-JS fallback for the consent settings UI.
 *
 * Reachable directly from the footer for users with JS disabled or who
 * open the page in a fresh tab. The form posts to `/api/consent`, which
 * sets the cookie via a `Set-Cookie` header and 303-redirects back here
 * with `?saved=1` so the user gets a confirmation message.
 *
 * The dashboard's modal (driven by JS) is the primary surface — this
 * page exists so we never fail closed for users with restricted clients.
 */
export default async function CookiePreferencesPage({ searchParams }: PageProps) {
  const [{ record }, params] = await Promise.all([
    loadConsentForRequest(),
    searchParams,
  ]);
  const saved = params.saved === "1";

  const functional = record?.categories.functional ?? false;
  const analytics = record?.categories.analytics ?? false;

  return (
    <MarketingShell>
      <section className="container max-w-2xl py-12 md:py-16">
        <div className="space-y-3">
          <Link
            href="/legal"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← All legal documents
          </Link>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Cookie preferences
          </h1>
          <p className="text-sm text-muted-foreground">
            IntakeClean does not run cross-site advertising. Choose which optional
            cookies you allow below. See the{" "}
            <Link className="underline" href="/legal/cookie-notice">
              Cookie Notice
            </Link>{" "}
            for the full list.
          </p>
        </div>

        {saved ? (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            Your preferences were saved.
          </div>
        ) : null}

        <form
          method="POST"
          action="/api/consent"
          className="mt-8 space-y-6 rounded-2xl border border-border bg-card p-6 shadow-soft"
        >
          <input type="hidden" name="next" value="/legal/cookie-preferences?saved=1" />

          <FallbackRow
            id="necessary-row"
            title="Strictly necessary"
            description="Authentication, session integrity, and security cookies. Cannot be disabled."
            checked
            disabled
          />
          <Separator />
          <FallbackRow
            id="functional-row"
            name="functional"
            title="Functional"
            description="Remembers preferences like theme and sidebar state."
            defaultChecked={functional}
          />
          <Separator />
          <FallbackRow
            id="analytics-row"
            name="analytics"
            title="Analytics"
            description="Aggregated, privacy-preserving usage analytics. Off by default. No analytics provider is enabled today."
            defaultChecked={analytics}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              type="submit"
              name="intent"
              value="essential_only"
              variant="ghost"
            >
              Reject all
            </Button>
            <Button
              type="submit"
              name="intent"
              value="accept_all"
              variant="outline"
            >
              Accept all
            </Button>
            <Button type="submit" name="intent" value="save">
              Save preferences
            </Button>
          </div>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Prefer the modal? On a JavaScript-enabled browser, click <em>Cookie
          preferences</em> in the page footer and the same options will appear in
          a dialog without leaving the page you&apos;re on.
        </p>
      </section>
    </MarketingShell>
  );
}

interface FallbackRowProps {
  id: string;
  title: string;
  description: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
}

/**
 * Plain HTML row that mirrors the modal's `CategoryRow` for non-JS users.
 * Uses native `<input type="checkbox">` so the form posts even without
 * Radix or React on the client.
 */
function FallbackRow({
  id,
  title,
  description,
  name,
  checked,
  defaultChecked,
  disabled,
}: FallbackRowProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded-sm border-primary text-primary"
      />
      <div className="space-y-1">
        <label htmlFor={id} className="text-sm font-semibold">
          {title}
          {disabled ? <span className="ml-2 text-xs text-muted-foreground">Always on</span> : null}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
