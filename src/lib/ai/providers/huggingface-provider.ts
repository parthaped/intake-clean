import "server-only";

import { InferenceClient } from "@huggingface/inference";

import type {
  AIProvider,
  DocumentClassificationResult,
  ReuploadReasonResult,
  VisionReviewResult,
} from "@/lib/ai/types";
import { REUPLOAD_REASON_TEMPLATES } from "@/lib/ai/rules/reupload-reasons";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/constants";
import { env, integrations } from "@/lib/env";
import type { AIProviderName, RecommendationT } from "@/types/database";

const HF_TIMEOUT_MS = 25_000;
const HF_MAX_RETRIES = 1;

let cachedClient: InferenceClient | null = null;
function getClient(): InferenceClient {
  if (cachedClient) return cachedClient;
  // The token is server-only; never serialised to the client.
  cachedClient = new InferenceClient(env.hfToken);
  return cachedClient;
}

/**
 * Wraps a promise in an AbortController-driven timeout. The HF SDK accepts a
 * signal but we keep this generic so callers can compose retries on top.
 */
function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return run(controller.signal).finally(() => clearTimeout(timer));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= HF_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // Don't retry on client errors (4xx) or aborts.
      if (message.includes("aborted") || message.includes("400") || message.includes("401") || message.includes("403")) {
        break;
      }
      if (attempt < HF_MAX_RETRIES) {
        const backoff = 750 * Math.pow(2, attempt);
        console.warn(`[hf] ${label} failed (attempt ${attempt + 1}); retrying in ${backoff}ms`, message);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

const CLASSIFICATION_SYSTEM_PROMPT = `You categorise documents that legal staff will review. Respond with JSON only, no commentary, in the form {"type": "<one of the allowed types>", "reason": "<one short sentence>"}.

Allowed types (pick exactly one):
${DOCUMENT_TYPES.join(" | ")}

Rules:
- Never invent a new type; if unsure return "Other / Unknown".
- Do not provide legal advice.
- The reason must be a single short sentence in plain English written for a non-lawyer.`;

const REUPLOAD_SYSTEM_PROMPT = `You write short, friendly re-upload requests sent to a law firm's clients. Rewrite the provided template so it is warm, plain English, no legal advice, no jargon, no more than two sentences. Respond with the rewritten message only — no quotes, no preamble.`;

/**
 * The vision system prompt is intentionally narrow. The model is allowed to
 * reason about the document's *type* and *capture quality*, but is forbidden
 * from transcribing names, numbers, dates of birth, addresses, signatures,
 * faces, biometric data, or any other identifying content. The downstream
 * audit log records only the model output, not the image bytes, but if the
 * model echoes PII into `reason` we'd inadvertently end up persisting it,
 * so the prompt explicitly carves PII out and we re-redact `reason` server-
 * side as a defence-in-depth measure.
 */
const VISION_SYSTEM_PROMPT = `You are a document classifier helping legal-intake staff triage uploads. You will see a single page of a document and must return JSON only, no commentary.

Allowed document types (pick exactly one):
${DOCUMENT_TYPES.join(" | ")}

Required JSON shape:
{
  "type": "<one allowed type>",
  "confidence": <number 0..1>,
  "recommendation": "accept" | "review" | "request_reupload",
  "blurry": <boolean>,
  "cut_off": <boolean>,
  "screenshot": <boolean>,
  "reason": "<one short sentence, no PII>"
}

Strict rules — non-negotiable:
- Do NOT transcribe names, numbers, dates of birth, addresses, account numbers, signatures, faces, or any other identifying content from the document.
- Do NOT speculate about the person's identity, immigration status, or legal situation.
- The "reason" field MUST be one plain-English sentence describing the document type or visual quality issue (e.g. "Looks like a passport photo page; image is sharp."). It MUST NOT echo any text from the document.
- If unsure about the type return "Other / Unknown" with confidence ≤ 0.4.
- If the image is unreadable, blurry, cut off, or a phone screenshot of a document, set "recommendation" to "request_reupload" and explain in plain English without quoting the document.
- Never provide legal advice.`;

interface ChatArgs {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  responseFormatJson: boolean;
}

async function callChat({ systemPrompt, userPrompt, model, responseFormatJson }: ChatArgs): Promise<string | null> {
  const client = getClient();
  const isEndpoint = Boolean(env.hfInferenceEndpointUrl);
  const endpointUrl = env.hfInferenceEndpointUrl;

  return withRetry(`chat(${model})`, async () =>
    withTimeout(async (signal) => {
      const completion = await (isEndpoint && endpointUrl
        ? client.endpoint(endpointUrl).chatCompletion(
            {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0,
              max_tokens: 256,
              ...(responseFormatJson ? { response_format: { type: "json_object" } } : {}),
            },
            { signal },
          )
        : client.chatCompletion(
            {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0,
              max_tokens: 256,
              ...(responseFormatJson ? { response_format: { type: "json_object" } } : {}),
            },
            { signal },
          ));
      const message = completion.choices?.[0]?.message?.content;
      return typeof message === "string" ? message : null;
    }, HF_TIMEOUT_MS),
  );
}

function pickDocumentType(value: unknown): DocumentType | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim();
  return DOCUMENT_TYPES.find((t) => t.toLowerCase() === normalised.toLowerCase()) ?? null;
}

function pickRecommendation(value: unknown): RecommendationT {
  if (value === "accept" || value === "review" || value === "request_reupload") return value;
  // Conservative default: anything we can't parse becomes a `review` so a
  // human still looks at it. We never auto-accept on unparseable output.
  return "review";
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pickBool(value: unknown): boolean {
  return value === true;
}

interface VisionChatArgs {
  imageBase64: string;
  imageMime: "image/jpeg" | "image/png";
  userPrompt: string;
  model: string;
}

async function callVisionChat({
  imageBase64,
  imageMime,
  userPrompt,
  model,
}: VisionChatArgs): Promise<string | null> {
  const client = getClient();
  const isEndpoint = Boolean(env.hfInferenceEndpointUrl);
  const endpointUrl = env.hfInferenceEndpointUrl;
  const dataUrl = `data:${imageMime};base64,${imageBase64}`;

  return withRetry(`vision(${model})`, async () =>
    withTimeout(async (signal) => {
      // The Hugging Face InferenceClient accepts an OpenAI-style content
      // array on chat completions when the underlying provider supports
      // multimodal input (Qwen2.5-VL, Llama-3.2-Vision, etc.). We pass the
      // image as a `data:` URL — the SDK forwards it to the provider, which
      // base64-decodes it server-side. Sending a data URL keeps us from
      // leaking a public URL of the document.
      const visionMessages = [
        { role: "system" as const, content: VISION_SYSTEM_PROMPT },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: userPrompt },
            { type: "image_url" as const, image_url: { url: dataUrl } },
          ],
        },
      ];
      const completion = await (isEndpoint && endpointUrl
        ? client.endpoint(endpointUrl).chatCompletion(
            {
              model,
              messages: visionMessages,
              temperature: 0,
              max_tokens: 256,
              response_format: { type: "json_object" },
            },
            { signal },
          )
        : client.chatCompletion(
            {
              model,
              messages: visionMessages,
              temperature: 0,
              max_tokens: 256,
              response_format: { type: "json_object" },
            },
            { signal },
          ));
      const message = completion.choices?.[0]?.message?.content;
      return typeof message === "string" ? message : null;
    }, HF_TIMEOUT_MS),
  );
}

const providerName: AIProviderName = env.hfInferenceEndpointUrl
  ? "huggingface_endpoint"
  : "huggingface_provider";

export const huggingfaceAIProvider: AIProvider = {
  name: providerName,
  async classifyDocument({ fileName, ocrText, mime, matterType, itemTitle }): Promise<DocumentClassificationResult | null> {
    if (!integrations.hasHuggingFace) return null;
    const userPrompt = [
      `Filename: ${fileName}`,
      `MIME: ${mime}`,
      `Matter type: ${matterType}`,
      `Checklist item: ${itemTitle ?? "n/a"}`,
      `OCR (first 1500 chars): ${(ocrText ?? "").slice(0, 1500)}`,
    ].join("\n");

    try {
      const raw = await callChat({
        systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
        userPrompt,
        model: env.hfTextModel,
        responseFormatJson: true,
      });
      if (!raw) return null;
      const parsed = safeJson(raw) as { type?: unknown; reason?: unknown } | null;
      const type = pickDocumentType(parsed?.type);
      if (!type) return null;
      return {
        type,
        confidence: 0.7,
        source: "huggingface",
        reason: typeof parsed?.reason === "string" ? parsed.reason : null,
        model: env.hfTextModel,
      };
    } catch (err) {
      console.error("[hf] classifyDocument failed", err);
      return null;
    }
  },

  async classifyDocumentVision({
    imageBase64,
    imageMime,
    matterType,
    itemTitle,
  }): Promise<VisionReviewResult | null> {
    if (!integrations.hasHuggingFace) return null;
    if (!imageBase64 || imageBase64.length === 0) return null;

    const userPrompt = [
      "Review the attached document image and reply with the JSON shape described in the system prompt.",
      `Matter type (context only, do not assume the document type from this): ${matterType}`,
      `Checklist item the client was asked to upload (hint only): ${itemTitle ?? "n/a"}`,
      "Remember: do NOT transcribe any text, names, numbers, signatures, or other identifying content from the document.",
    ].join("\n");

    try {
      const raw = await callVisionChat({
        imageBase64,
        imageMime,
        userPrompt,
        model: env.hfVisionModel,
      });
      if (!raw) return null;
      const parsed = safeJson(raw) as
        | {
            type?: unknown;
            confidence?: unknown;
            recommendation?: unknown;
            blurry?: unknown;
            cut_off?: unknown;
            screenshot?: unknown;
            reason?: unknown;
          }
        | null;
      const type = pickDocumentType(parsed?.type);
      if (!type) return null;
      const reason = typeof parsed?.reason === "string" ? parsed.reason.slice(0, 240) : null;
      return {
        type,
        confidence: clampConfidence(parsed?.confidence),
        recommendation: pickRecommendation(parsed?.recommendation),
        reason,
        blurry: pickBool(parsed?.blurry),
        cutOff: pickBool(parsed?.cut_off),
        screenshot: pickBool(parsed?.screenshot),
        model: env.hfVisionModel,
      };
    } catch (err) {
      console.error("[hf] classifyDocumentVision failed", err);
      return null;
    }
  },

  async rewriteReuploadReason({ template, flags, matterType }): Promise<ReuploadReasonResult | null> {
    if (!integrations.hasHuggingFace) return null;
    const baseTemplate = REUPLOAD_REASON_TEMPLATES[template] ?? template;
    const userPrompt = [
      `Matter type: ${matterType}`,
      `Detected issues: ${flags.firedFlags.join(", ") || "none"}`,
      `Template to rewrite: ${baseTemplate}`,
    ].join("\n");
    try {
      const raw = await callChat({
        systemPrompt: REUPLOAD_SYSTEM_PROMPT,
        userPrompt,
        model: env.hfTextModel,
        responseFormatJson: false,
      });
      if (!raw) return null;
      const text = raw.trim();
      if (text.length < 10) return null;
      return { text, source: "huggingface", template, model: env.hfTextModel };
    } catch (err) {
      console.error("[hf] rewriteReuploadReason failed", err);
      return null;
    }
  },
};

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // Some models wrap JSON in ```json fences — strip them and try again.
    const stripped = value
      .replace(/```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}
