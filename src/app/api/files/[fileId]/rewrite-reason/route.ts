import { NextResponse } from "next/server";
import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import { REUPLOAD_REASON_TEMPLATES, flagsToReason } from "@/lib/ai/rules/reupload-reasons";
import type { LocalQualityFlags } from "@/lib/ai/types";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

const schema = z.object({
  template: z.string().optional(),
  reason: z.string().optional(),
});

interface Context {
  params: Promise<{ fileId: string }>;
}

/**
 * Optional HF helper: rewrites a re-upload reason in client-friendly language.
 * Only callable by signed-in staff. Skipped silently when USE_HF_EXPLANATIONS
 * is off — the dialog falls back to the raw template the staff already saw.
 */
export async function POST(request: Request, context: Context) {
  // Burns Hugging Face tokens. Restricted to staff roles so a future
  // viewer/client role can't drain the firm's HF quota by repeatedly
  // tapping the rewrite button.
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  // HF spend protection: cap how often a single user can fan out HF calls
  // even when they're a legitimate signed-in staff member.
  const limited = await enforceRateLimit(limits.hfRewrite, `${ctx.userId}:hf-rewrite`);
  if (limited) return limited;
  const { fileId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Invalid request", { status: 400 });

  if (!env.useHfExplanations || !integrations.hasHuggingFace) {
    return new NextResponse("AI rewrite is disabled", { status: 403 });
  }

  const service = getServiceSupabase();
  type FileRow = {
    id: string;
    organization_id: string;
    matter_id: string;
    quality_checks: Array<{ local_flags: Json | null }> | null;
  };
  const { data: fileData } = await service
    .from("uploaded_files")
    .select("id, organization_id, matter_id, quality_checks(local_flags)")
    .eq("id", fileId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const file = fileData as FileRow | null;
  if (!file) return new NextResponse("File not found", { status: 404 });

  const { data: matter } = await service
    .from("matters")
    .select("matter_type")
    .eq("id", file.matter_id)
    .maybeSingle();

  const localFlags = readLocalFlags(file.quality_checks?.[0]?.local_flags ?? null);
  const fallback = flagsToReason(localFlags);
  const templateId = parsed.data.template && REUPLOAD_REASON_TEMPLATES[parsed.data.template]
    ? parsed.data.template
    : fallback.template ?? "generic";
  const seedTemplate = parsed.data.reason ?? REUPLOAD_REASON_TEMPLATES[templateId] ?? fallback.text;

  try {
    const provider = await getAIProvider();
    if (!provider.rewriteReuploadReason) {
      return NextResponse.json({ text: seedTemplate, source: "template" });
    }
    const result = await provider.rewriteReuploadReason({
      template: templateId,
      flags: localFlags,
      matterType: matter?.matter_type ?? "other",
    });
    if (!result) return NextResponse.json({ text: seedTemplate, source: "template" });

    await recordAudit({
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      action: "file.reupload_reason_rewritten",
      entityType: "uploaded_file",
      entityId: file.id,
      metadata: { template: templateId, model: result.model ?? null },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[rewrite-reason] failed", err);
    return NextResponse.json({ text: seedTemplate, source: "template" });
  }
}

function readLocalFlags(value: Json | null): LocalQualityFlags {
  const fallback: LocalQualityFlags = {
    blurScore: 0,
    brightness: null,
    contrast: null,
    width: null,
    height: null,
    glareDetected: false,
    lowContrastDetected: false,
    cutOffEdgesDetected: false,
    rotatedDetected: false,
    screenshotDetected: false,
    lowResolutionDetected: false,
    ocrTextTooShort: false,
    firedFlags: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  return {
    ...fallback,
    blurScore: typeof v.blurScore === "number" ? v.blurScore : 0,
    brightness: typeof v.brightness === "number" ? v.brightness : null,
    contrast: typeof v.contrast === "number" ? v.contrast : null,
    width: typeof v.width === "number" ? v.width : null,
    height: typeof v.height === "number" ? v.height : null,
    glareDetected: Boolean(v.glareDetected),
    lowContrastDetected: Boolean(v.lowContrastDetected),
    cutOffEdgesDetected: Boolean(v.cutOffEdgesDetected),
    rotatedDetected: Boolean(v.rotatedDetected),
    screenshotDetected: Boolean(v.screenshotDetected),
    lowResolutionDetected: Boolean(v.lowResolutionDetected),
    ocrTextTooShort: Boolean(v.ocrTextTooShort),
    firedFlags: Array.isArray(v.firedFlags) ? v.firedFlags.filter((f): f is string => typeof f === "string") : [],
  };
}
