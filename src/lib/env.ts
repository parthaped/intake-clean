/**
 * Centralised access to environment variables. Each property is computed lazily
 * so that the build doesn't fail when optional integrations are not configured.
 */

import type { AIProviderName, OcrEngineName } from "@/types/database";

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value;
}

/**
 * Trim/normalize a value that has already been read via LITERAL
 * `process.env.NAME` access. We need literal access (not the dynamic `read()`
 * helper above) for every `NEXT_PUBLIC_*` variable, because Next.js only
 * inlines those into the client bundle when the property access is statically
 * analyzable. Dynamic `process.env[varName]` lookups always return `undefined`
 * in the browser, which is what was producing the misleading
 * "Supabase env not configured" error in production despite the variables
 * being set on Vercel.
 */
function clean(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") return undefined;
  return value;
}

const TRUTHY = new Set(["true", "1", "yes", "y", "on"]);
const FALSY = new Set(["false", "0", "no", "n", "off", ""]);

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = read(name);
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return defaultValue;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.replace(/\/+$/, "") : url;
}

/**
 * Same as `stripTrailingSlash` but returns `undefined` if the input was
 * entirely slashes (e.g. `"/"` or `"//"`) so the caller's `??` fallback can
 * fire instead of silently producing an empty URL.
 */
function stripTrailingSlashOrUndefined(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const stripped = stripTrailingSlash(url);
  return stripped === "" ? undefined : stripped;
}

function readAIProvider(): AIProviderName {
  const raw = (read("AI_PROVIDER") ?? "mock") as AIProviderName;
  switch (raw) {
    case "mock":
    case "local_ocr_only":
    case "huggingface_provider":
    case "huggingface_endpoint":
      return raw;
    default:
      return "mock";
  }
}

function readOCREngine(): OcrEngineName {
  const raw = (read("OCR_ENGINE") ?? "tesseract") as OcrEngineName;
  switch (raw) {
    case "tesseract":
    case "paddleocr":
    case "mock":
    case "none":
      return raw;
    default:
      return "tesseract";
  }
}

export const env = {
  // Strip trailing slash so callers can safely build URLs as `${appUrl}/path`
  // without producing accidental `https://example.com//path` (which Stripe
  // and some email clients treat differently from the canonical URL).
  // If the env var is `"/"` (slashes-only), `stripTrailingSlashOrUndefined`
  // returns undefined so we fall back to the localhost default instead of
  // emitting an empty `appUrl` that would break OAuth/Stripe redirects.
  appUrl:
    stripTrailingSlashOrUndefined(clean(process.env.NEXT_PUBLIC_APP_URL)) ??
    "http://localhost:3000",

  // Accept canonical names, the legacy anon/service-role names, AND the
  // names auto-provisioned by the Vercel Supabase Marketplace integration
  // (which prefixes everything with `STORAGE_`). This means the same code
  // works with a hand-rolled Supabase project or a Vercel Marketplace one
  // without renaming any env vars in the Vercel dashboard.
  //
  // NEXT_PUBLIC_* names use literal `process.env.NAME` access so Next.js
  // inlines them into the client bundle. The non-public `STORAGE_*`
  // fallbacks are server-only and can use the dynamic `read()` helper.
  supabaseUrl:
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    clean(process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL) ??
    read("STORAGE_SUPABASE_URL"),
  supabaseAnonKey:
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    clean(process.env.NEXT_PUBLIC_STORAGE_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_STORAGE_SUPABASE_ANON_KEY) ??
    read("STORAGE_SUPABASE_PUBLISHABLE_KEY") ??
    read("STORAGE_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey:
    read("SUPABASE_SECRET_KEY") ??
    read("SUPABASE_SERVICE_ROLE_KEY") ??
    read("STORAGE_SUPABASE_SECRET_KEY") ??
    read("STORAGE_SUPABASE_SERVICE_ROLE_KEY"),

  resendApiKey: read("RESEND_API_KEY"),
  resendFromEmail: read("RESEND_FROM_EMAIL") ?? "IntakeClean <onboarding@resend.dev>",

  twilioAccountSid: read("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: read("TWILIO_AUTH_TOKEN"),
  twilioPhoneNumber: read("TWILIO_PHONE_NUMBER"),

  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  stripePublishableKey: clean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  stripePriceStarter: read("STRIPE_PRICE_STARTER"),
  stripePriceSolo: read("STRIPE_PRICE_SOLO"),
  stripePriceFirm: read("STRIPE_PRICE_FIRM"),

  // ----- Document AI pipeline -----
  aiProvider: readAIProvider(),
  ocrEngine: readOCREngine(),
  useLocalOcr: readBool("USE_LOCAL_OCR", true),
  useHfClassification: readBool("USE_HF_CLASSIFICATION", false),
  useHfExplanations: readBool("USE_HF_EXPLANATIONS", false),
  // Multimodal vision review of uploaded photos. Off by default — sending
  // images (even thumbnails) to a third-party inference provider is the most
  // sensitive AI option we offer, so it requires both this env flag AND the
  // per-firm `use_hf_vision` toggle in `ai_settings` before any image leaves
  // the platform. Even when on, the prompt forbids transcribing PII and we
  // re-redact the model's text reply server-side.
  useHfVision: readBool("USE_HF_VISION", false),
  mockAi: readBool("MOCK_AI", true),

  tesseractLang: read("TESSERACT_LANG") ?? "eng",
  paddleocrServiceUrl: read("PADDLEOCR_SERVICE_URL"),

  // ----- Hugging Face -----
  hfToken: read("HF_TOKEN"),
  hfInferenceEndpointUrl: read("HF_INFERENCE_ENDPOINT_URL"),
  hfDocumentModel: read("HF_DOCUMENT_MODEL") ?? "docling-project/SmolDocling-256M-preview",
  hfVisionModel: read("HF_VISION_MODEL") ?? "Qwen/Qwen2.5-VL-7B-Instruct",
  hfTextModel: read("HF_TEXT_MODEL") ?? "Qwen/Qwen2.5-3B-Instruct",

  devBypassBilling: readBool("DEV_BYPASS_BILLING", false),
  adminDebug: readBool("ADMIN_DEBUG", false),

  // Shared secret used to gate internal cron-triggered routes (e.g. the
  // queue drainer). Vercel Cron sets the `Authorization: Bearer <CRON_SECRET>`
  // header automatically when this env var is configured.
  cronSecret: read("CRON_SECRET"),
} as const;

export const integrations = {
  hasSupabase: Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey),
  hasResend: Boolean(env.resendApiKey),
  hasTwilio: Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioPhoneNumber),
  hasStripe: Boolean(env.stripeSecretKey && env.stripePublishableKey),
  hasHuggingFace: Boolean(env.hfToken || env.hfInferenceEndpointUrl),
  hasHfEndpoint: Boolean(env.hfInferenceEndpointUrl),
  useMockAi: env.mockAi || env.aiProvider === "mock",
};

/** Throw a clear, descriptive error if Supabase isn't configured. */
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Supabase env not configured. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (or accept the Vercel Marketplace auto-provisioned NEXT_PUBLIC_STORAGE_SUPABASE_* equivalents).",
    );
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}

// =============================================================================
// Production misconfiguration warnings.
//
// Logged once at module load (i.e. once per cold start of each function
// instance). We intentionally log a `console.warn` rather than throwing —
// the app is designed to boot in mock mode for local development, and
// throwing here would take down `/dashboard` rendering for an admin who
// otherwise needs to fix the misconfiguration. Surfacing the warning in
// Vercel function logs is enough to make the issue visible while leaving
// the rest of the platform usable.
//
// Only runs server-side (the `process.env.VERCEL_ENV` literal is undefined
// in browser bundles, so `vercelEnv === "production"` is never true there).
// =============================================================================
const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv === "production") {
  if (env.appUrl === "http://localhost:3000") {
    console.warn(
      "[startup] NEXT_PUBLIC_APP_URL is missing in this production environment. Outbound email/SMS upload links will point at http://localhost:3000 and clients will be unable to upload. Set the secret via `vercel env add NEXT_PUBLIC_APP_URL production` (e.g. https://intakeclean.com) and redeploy.",
    );
  }
  if (!integrations.hasResend) {
    console.warn(
      "[startup] RESEND_API_KEY is missing in this production environment. Outbound email will be silently mocked (status='sent_mock') and never reach clients. Set the secret via `vercel env add RESEND_API_KEY production` and redeploy.",
    );
  }
  if (
    integrations.hasResend &&
    env.resendFromEmail.includes("onboarding@resend.dev")
  ) {
    console.warn(
      "[startup] RESEND_FROM_EMAIL is using the Resend sandbox address (onboarding@resend.dev). Resend will reject sends to any address other than the Resend account owner. Verify a custom domain (see docs/security/email-domain-auth.md) and set RESEND_FROM_EMAIL accordingly.",
    );
  }
}
