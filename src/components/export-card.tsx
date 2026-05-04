"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPORT_TYPE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { ExportType } from "@/types/database";

interface RecentExport {
  id: string;
  export_type: ExportType;
  summary: string | null;
  created_at: string;
}

interface ExportCardProps {
  matterId: string;
  recent: RecentExport[];
  acceptedCount: number;
}

export function ExportCard({ matterId, recent, acceptedCount }: ExportCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string | null>(null);

  function trigger(kind: "pdf" | "zip" | "missing") {
    const url =
      kind === "pdf"
        ? `/api/matters/${matterId}/export-pdf`
        : kind === "zip"
          ? `/api/matters/${matterId}/export-zip`
          : `/api/matters/${matterId}/export-missing-report`;
    setActive(kind);
    startTransition(async () => {
      const res = await fetch(url, { method: "POST" });
      setActive(null);
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Export failed");
        return;
      }
      toast.success("Export ready");
      router.refresh();
    });
  }

  const disablePackets = acceptedCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Generate exports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Button onClick={() => trigger("pdf")} disabled={pending || disablePackets} variant="default" className="justify-start">
            {pending && active === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Clean PDF packet
          </Button>
          <Button onClick={() => trigger("zip")} disabled={pending || disablePackets} variant="outline" className="justify-start">
            {pending && active === "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Organized ZIP folder
          </Button>
          <Button onClick={() => trigger("missing")} disabled={pending} variant="outline" className="justify-start">
            {pending && active === "missing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Missing documents report
          </Button>
        </div>
        {disablePackets && (
          <p className="text-xs text-muted-foreground">
            Accept at least one file in the review queue to enable the PDF packet and ZIP folder.
          </p>
        )}
        {recent.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent exports</p>
            {recent.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card/40 px-3 py-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{EXPORT_TYPE_LABEL[row.export_type]}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/api/exports/${row.id}/signed-url`} target="_blank">
                    <Download className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
