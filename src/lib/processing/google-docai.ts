import "server-only";

import { env, integrations } from "@/lib/env";

import type { QualityResult } from "@/lib/processing/mock";

/**
 * Calls Google Document AI when env vars are present and turns its response
 * into the same QualityResult shape the mock processor produces. Returns null
 * if Document AI isn't configured or the call fails — the orchestrator then
 * falls back to the mock processor.
 */
export async function runDocumentAiQualityCheck(buffer: Buffer, mime: string): Promise<QualityResult | null> {
  if (!integrations.hasGoogleDocAi) return null;

  try {
    // Lazy import so the package isn't loaded into the build when unused.
    const { DocumentProcessorServiceClient } = await import("@google-cloud/documentai/build/src/v1");
    const credentials = JSON.parse(env.googleApplicationCredentialsJson!);
    const client = new DocumentProcessorServiceClient({ credentials, projectId: credentials.project_id });
    const name = `projects/${env.googleDocAiProjectId}/locations/${env.googleDocAiLocation}/processors/${env.googleDocAiProcessorId}`;
    const [response] = await client.processDocument({
      name,
      rawDocument: { content: buffer.toString("base64"), mimeType: mime },
    });

    const document = response.document;
    if (!document) return null;

    const text = document.text ?? "";
    const pages = document.pages ?? [];
    const avgConfidence = pages.length
      ? pages.reduce((acc, page) => acc + (page.layout?.confidence ?? 0), 0) / pages.length
      : 0;

    const issues: string[] = [];
    if (avgConfidence < 0.6) issues.push("OCR confidence is low. The text may not be clear enough to process.");
    const issueSummary = issues.length > 0 ? issues.join(" ") : "Looks usable. Awaiting staff review.";
    const recommendation = avgConfidence < 0.5 ? "request_reupload" : avgConfidence < 0.75 ? "review" : "accept";

    return {
      blurScore: Math.max(0, Math.min(1, 1 - avgConfidence)),
      glareDetected: false,
      lowContrastDetected: false,
      cutOffEdgesDetected: false,
      rotatedDetected: false,
      screenshotDetected: false,
      handwritingDetected: null,
      textExtractionConfidence: avgConfidence,
      issueSummary,
      recommendation,
      rawAiJson: {
        provider: "google-document-ai",
        avgConfidence,
        textLength: text.length,
        pageCount: pages.length,
      },
      ocrText: text || null,
    };
  } catch (error) {
    console.error("[google-docai] processDocument failed", error);
    return null;
  }
}
