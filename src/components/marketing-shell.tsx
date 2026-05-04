import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { DISCLAIMER_LINES } from "@/lib/constants";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2">
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
        <div className="container space-y-3 py-10 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BrandMark />
            <p>&copy; {new Date().getFullYear()} IntakeClean</p>
          </div>
          <div className="space-y-1 text-xs">
            {DISCLAIMER_LINES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
