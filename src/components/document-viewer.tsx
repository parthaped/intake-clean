"use client";

import { ExternalLink, FileText } from "lucide-react";

interface DocumentViewerProps {
  url: string | null;
  mime: string;
  fileName: string;
  emptyLabel?: string;
}

export function DocumentViewer({ url, mime, fileName, emptyLabel = "No preview available" }: DocumentViewerProps) {
  if (!url) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 text-sm text-muted-foreground">
        <FileText className="mb-2 h-5 w-5" />
        {emptyLabel}
      </div>
    );
  }

  if (mime === "application/pdf") {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <iframe src={url} title={fileName} className="h-[480px] w-full" />
        <div className="flex justify-end border-t border-border bg-secondary/40 px-3 py-2">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  if (mime.startsWith("image/")) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={fileName} className="max-h-[480px] w-full object-contain bg-secondary/30" />
        <div className="flex justify-end border-t border-border bg-secondary/40 px-3 py-2">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
            Open original <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 text-sm text-muted-foreground">
      <FileText className="mb-2 h-5 w-5" />
      Preview not available — {fileName}
    </div>
  );
}
