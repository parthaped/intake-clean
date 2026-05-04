import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { DISCLAIMER_LINES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col p-8">
        <Link href="/" className="inline-flex">
          <BrandMark />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">{children}</div>
        <p className="mx-auto max-w-sm text-center text-xs text-muted-foreground">{DISCLAIMER_LINES[0]}</p>
      </div>
      <div className="hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <BrandMark className="text-primary-foreground" withWordmark />
        <div className="space-y-6">
          <p className="text-3xl font-medium leading-snug">
            "We stopped chasing clients for clean PDFs. They upload whatever they have. We get a packet."
          </p>
          <div className="text-sm opacity-80">— Lead paralegal, immigration practice (pilot)</div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm opacity-80">
          {[
            "Convert HEIC, screenshots, sideways scans",
            "Quality flag blurry or cut-off pages",
            "Auto-organize by document type",
            "Export clean PDF packets and ZIPs",
          ].map((item) => (
            <div key={item} className="rounded-xl bg-white/5 p-3">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
