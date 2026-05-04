import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t find that page.</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        It may have moved, been archived, or never existed. Try the dashboard.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
