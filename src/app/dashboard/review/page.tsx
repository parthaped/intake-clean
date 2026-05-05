import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ReviewWorkspace } from "@/app/dashboard/review/review-workspace";
import { Card } from "@/components/ui/card";
import { REUPLOAD_REASON_PRESETS } from "@/lib/ai/rules/reupload-reasons";
import { requireSession } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { createSignedUrl } from "@/lib/files";
import { getServiceSupabase } from "@/lib/supabase/service";
import type {
  ClassificationSource,
  Json,
  OcrEngineName,
  RecommendationT,
  ReviewStatus,
  UploadedFileStatus,
} from "@/types/database";

interface PageProps {
  searchParams: Promise<{ matter?: string; file?: string; status?: string }>;
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

export default async function ReviewQueuePage({ searchParams }: PageProps) {
  const { matter: matterFilter, file: focusedFileId } = await searchParams;
  const ctx = await requireSession();
  const service = getServiceSupabase();

  let query = service
    .from("uploaded_files")
    .select(
      "id, original_file_name, original_mime_type, original_storage_path, processed_storage_path, thumbnail_storage_path, detected_document_type, status, created_at, updated_at, matter_id, processing_provider, ocr_text, ocr_confidence, classification_confidence, classification_source, matters(id, matter_name), quality_checks(blur_score, glare_detected, low_contrast_detected, cut_off_edges_detected, rotated_detected, screenshot_detected, text_extraction_confidence, issue_summary, recommendation, raw_ai_json, local_flags, ocr_engine, hf_model_used), review_tasks(status, reviewer_notes)",
    )
    .eq("organization_id", ctx.organization.id)
    .in("status", ["needs_review", "needs_reupload", "processing"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (matterFilter) query = query.eq("matter_id", matterFilter);

  const { data } = await query;
  const rows = (data ?? []) as unknown as ReviewQueueRow[];

  const focused = focusedFileId ? rows.find((r) => r.id === focusedFileId) ?? rows[0] : rows[0];

  const previews: Record<string, { original: string | null; processed: string | null; thumbnail: string | null }> = {};
  await Promise.all(
    rows.map(async (row) => {
      const [original, processed, thumbnail] = await Promise.all([
        createSignedUrl("original-documents", row.original_storage_path, 600),
        row.processed_storage_path ? createSignedUrl("processed-documents", row.processed_storage_path, 600) : null,
        row.thumbnail_storage_path ? createSignedUrl("thumbnails", row.thumbnail_storage_path, 600) : null,
      ]);
      previews[row.id] = { original, processed, thumbnail };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
          <p className="text-muted-foreground">
            {rows.length} file{rows.length === 1 ? "" : "s"} waiting on staff review.
          </p>
        </div>
        {matterFilter && (
          <Link href="/dashboard/review" className="text-sm text-accent hover:underline">
            Clear matter filter
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          Icon={ShieldCheck}
          title="Inbox zero"
          description="You're caught up. New uploads will appear here as they finish processing."
        />
      ) : focused ? (
        <ReviewWorkspace
          rows={rows}
          previews={previews}
          initialFileId={focused.id}
          presets={[...REUPLOAD_REASON_PRESETS]}
          canRewriteWithHF={env.useHfExplanations && integrations.hasHuggingFace}
        />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">No file selected.</Card>
      )}
    </div>
  );
}
