"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cpu, Inbox, Save, ScanText, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { BeforeAfterPreview } from "@/components/before-after-preview";
import { QualityFlagList } from "@/components/quality-flag-list";
import { ReviewActionBar } from "@/components/review-action-bar";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CLASSIFICATION_SOURCE_LABEL,
  DOCUMENT_TYPES,
  OCR_ENGINE_LABEL,
  type DocumentType,
} from "@/lib/constants";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type {
  ClassificationSource,
  Json,
  OcrEngineName,
  RecommendationT,
  ReviewStatus,
  UploadedFileStatus,
} from "@/types/database";

interface ReuploadPreset {
  id: string;
  label: string;
  text: string;
}

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
  processing_provider: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  classification_confidence: number | null;
  classification_source: ClassificationSource | null;
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
    local_flags: Json;
    ocr_engine: OcrEngineName | null;
    hf_model_used: string | null;
  }>;
  review_tasks: Array<{ status: ReviewStatus; reviewer_notes: string | null }>;
}

interface ReviewWorkspaceProps {
  rows: ReviewQueueRow[];
  previews: Record<string, { original: string | null; processed: string | null; thumbnail: string | null }>;
  initialFileId: string;
  presets: ReuploadPreset[];
  canRewriteWithHF: boolean;
}

function readLocalFlags(value: Json | null | undefined): { firedFlags: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { firedFlags: [] };
  const fired = (value as Record<string, unknown>).firedFlags;
  if (!Array.isArray(fired)) return { firedFlags: [] };
  return { firedFlags: fired.filter((f): f is string => typeof f === "string") };
}

function pickDefaultPreset(firedFlags: string[]): string | undefined {
  const priority = [
    "blur_detected",
    "cut_off_edges_detected",
    "screenshot_detected",
    "ocr_text_too_short",
    "low_contrast_detected",
    "rotated_detected",
    "low_resolution_detected",
  ];
  return priority.find((f) => firedFlags.includes(f));
}

export function ReviewWorkspace({ rows, previews, initialFileId, presets, canRewriteWithHF }: ReviewWorkspaceProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string>(initialFileId);
  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? rows[0], [activeId, rows]);
  const [overridePending, startOverride] = useTransition();
  const [overrideType, setOverrideType] = useState<DocumentType | "">("");

  if (!active) return null;

  const quality = active.quality_checks[0];
  const localFlags = readLocalFlags(quality?.local_flags);
  const reviewTask = active.review_tasks[0];

  const isMock =
    active.processing_provider === "mock" ||
    (quality && typeof quality.raw_ai_json === "object" && quality.raw_ai_json !== null && !Array.isArray(quality.raw_ai_json) && (quality.raw_ai_json as { mock?: boolean }).mock === true);

  const preview = previews[active.id] ?? { original: null, processed: null, thumbnail: null };
  const defaultPresetId = pickDefaultPreset(localFlags.firedFlags);

  function handleActionComplete() {
    router.refresh();
  }

  function saveOverride() {
    if (!overrideType) return;
    startOverride(async () => {
      const res = await fetch(`/api/files/${activeId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "override", manualDocumentType: overrideType }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Could not save override");
        return;
      }
      toast.success("Document type updated");
      setOverrideType("");
      router.refresh();
    });
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
            {/* Provider / model / source pills */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Cpu className="h-3.5 w-3.5" /> Checked locally
              </Badge>
              {quality?.ocr_engine && (
                <Badge variant="outline" className="gap-1.5">
                  <ScanText className="h-3.5 w-3.5" /> OCR: {OCR_ENGINE_LABEL[quality.ocr_engine] ?? quality.ocr_engine}
                </Badge>
              )}
              {quality?.hf_model_used && (
                <Badge variant="outline" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> HF: {quality.hf_model_used}
                </Badge>
              )}
              {active.classification_source && (
                <Badge variant="outline">
                  Source: {CLASSIFICATION_SOURCE_LABEL[active.classification_source] ?? active.classification_source}
                </Badge>
              )}
              {active.classification_confidence != null && (
                <Badge variant="outline">
                  Confidence: {(active.classification_confidence * 100).toFixed(0)}%
                </Badge>
              )}
              {isMock && <Badge variant="outline">Mock analysis</Badge>}
            </div>

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

            {active.ocr_text && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OCR text preview</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-3 font-mono text-xs leading-relaxed">
                  {active.ocr_text.slice(0, 1500)}
                  {active.ocr_text.length > 1500 ? "\n…" : ""}
                </pre>
              </div>
            )}

            {/* Manual document type override */}
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Override document type</p>
                <select
                  value={overrideType}
                  onChange={(e) => setOverrideType(e.target.value as DocumentType | "")}
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-card px-3 text-sm"
                >
                  <option value="">Pick a type to override AI…</option>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={saveOverride}
                disabled={overridePending || !overrideType}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" /> Save override
              </Button>
            </div>

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
              <ReviewActionBar
                fileId={active.id}
                presets={presets}
                defaultPresetId={defaultPresetId}
                canRewriteWithHF={canRewriteWithHF}
                onActionComplete={handleActionComplete}
              />
            </div>
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              AI checks are assistive only. Firm staff must review every document before use.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
