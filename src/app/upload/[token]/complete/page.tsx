import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import { DISCLAIMER_LINES } from "@/lib/constants";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function UploadCompletePage({ params }: PageProps) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-semibold">Thanks. Files received.</h1>
            <p className="text-muted-foreground">
              The firm will review these and contact you if anything needs to be re-uploaded.
            </p>
            <div className="pt-2">
              <Link href={`/upload/${token}`} className="text-sm font-medium text-accent hover:underline">
                Upload more files
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
      <footer className="border-t border-border bg-card/60 py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-2xl space-y-1 px-4">
          {DISCLAIMER_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
