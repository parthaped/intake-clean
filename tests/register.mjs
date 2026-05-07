import { register } from "node:module";

// Install our loader hook (server-only shim). tsx must already be registered
// before this runs (we pass --import tsx --import ./tests/register.mjs).
register("./loader.mjs", import.meta.url);

// Deterministic, minimal env so `src/lib/env.ts` and friends can be imported
// in tests without real Supabase / Stripe / Resend credentials.
const defaults = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
  SUPABASE_SECRET_KEY: "test-service-role",
  AI_PROVIDER: "mock",
  OCR_ENGINE: "tesseract",
  MOCK_AI: "true",
  // The upload route's `triggerDrain` only attaches an authorization
  // header when `env.cronSecret` is set. We seed a deterministic value
  // so the route-level tests can assert the wiring is in place — the
  // real production secret is provisioned per-environment.
  CRON_SECRET: "test-cron-secret",
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined || process.env[k] === "") {
    process.env[k] = v;
  }
}
