"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { BeforeAfterPreview } from "@/components/before-after-preview";
import { QualityFlagList } from "@/components/quality-flag-list";
import { ReviewActionBar } from "@/components/review-action-bar";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type {
  Json,
  RecommendationT,
  ReviewStatus,
  UploadedFileStatus,
} from "@/types/database";

interface ReviewQueueRow {
  id: string;
  original_file_name: string;
  original_mime_type: string;
  original_storage_path: string;
  processed_storage_path: string | null;
  thumbnail_storage_path: string | null;
  detected_document_type: string | null;
  status: UploadedFileStatus;
  created_at: string;
  updated_at: string;
  matter_id: string;
  matters: { id: string; matter_name: string } | null;
  quality_checks: Array<{
    blur_score: number | null;
    glare_detected: boolean;
    low_contrast_detected: boolean;
    cut_off_edges_detected: boolean;
    rotated_detected: boolean;
    screenshot_detected: boolean;
    text_extraction_confidence: number | null;
    issue_summary: string | null;
    recommendation: RecommendationT;
    raw_ai_json: Json;
  }>;
  review_tasks: Array<{ status: ReviewStatus; reviewer_notes: string | null }>;
}

interface ReviewWorkspaceProps {
  rows: ReviewQueueRow[];
  previews: Record<string, { original: string | null; processed: string | null; thumbnail: string | null }>;
  initialFileId: string;
}

export function ReviewWorkspace({ rows, previews, initialFileId }: ReviewWorkspaceProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string>(initialFileId);
  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? rows[0], [activeId, rows]);

  if (!active) return null;

  const quality = active.quality_checks[0];
  const reviewTask = active.review_tasks[0];
  const isMock = quality && typeof quality.raw_ai_json === "object" && quality.raw_ai_json !== null && !Array.isArray(quality.raw_ai_json) && (quality.raw_ai_json as { mock?: boolean }).mock === true;

  const preview = previews[active.id] ?? { original: null, processed: null, thumbnail: null };

  function handleActionComplete() {
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{rows.length} files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[640px]">
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const matterName = row.matters?.matter_name ?? "—";
                const flagsCount = row.quality_checks[0]
                  ? Number(row.quality_checks[0].cut_off_edges_detected) +
                    Number(row.quality_checks[0].screenshot_detected) +
                    Number(row.quality_checks[0].low_contrast_detected) +
                    Number(row.quality_checks[0].glare_detected)
                  : 0;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(row.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-secondary/40",
                        row.id === activeId && "bg-secondary",
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                        {previews[row.id]?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previews[row.id]!.thumbnail!}
                            alt={row.original_file_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Inbox className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{row.original_file_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{matterName}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge kind="file" status={row.status} className="px-1.5 py-0.5 text-[10px]" />
                          {flagsCount > 0 && (
                            <Badge variant="warning" className="px-1.5 py-0.5 text-[10px]">
                              {flagsCount} flag{flagsCount === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                <Link href={`/dashboard/matters/${active.matter_id}`} className="hover:underline">
                  {active.matters?.matter_name ?? "Matter"}
                </Link>
              </p>
              <CardTitle>{active.original_file_name}</CardTitle>
              <p className="text-xs text-muted-foreground">Uploaded {relativeTime(active.created_at)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge kind="file" status={active.status} />
              {active.detected_document_type && <Badge variant="primary">{active.detected_document_type}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <BeforeAfterPreview
              originalUrl={preview.original}
              originalMime={active.original_mime_type}
              processedUrl={preview.processed}
              processedMime={active.processed_storage_path ? "image/jpeg" : null}
              fileName={active.original_file_name}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quality ? (
              <QualityFlagList
                blurScore={quality.blur_score}
                glareDetected={quality.glare_detected}
                lowContrastDetected={quality.low_contrast_detected}
                cutOffEdgesDetected={quality.cut_off_edges_detected}
                rotatedDetected={quality.rotated_detected}
                screenshotDetected={quality.screenshot_detected}
                textExtractionConfidence={quality.text_extraction_confidence}
                issueSummary={quality.issue_summary}
                recommendation={quality.recommendation}
                isMock={!!isMock}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Processing… quality data will appear once analysis runs.</p>
            )}
            {reviewTask?.reviewer_notes && (
              <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reviewer notes
                </p>
                {reviewTask.reviewer_notes}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Last updated {formatDateTime(active.updated_at)}</p>
              <ReviewActionBar fileId={active.id} onActionComplete={handleActionComplete} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
