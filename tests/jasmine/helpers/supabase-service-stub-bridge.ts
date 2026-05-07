/**
 * Typed bridge to the CJS supabase service stub at
 * `tests/shims/supabase-service-stub.cjs`. The stub is what
 * `tests/bootstrap.cjs` and `tests/loader.mjs` redirect every import of
 * `@/lib/supabase/service` to during a test run, so tests get to install
 * a fake `getServiceSupabase` per-spec without touching prod code.
 *
 * Importing this bridge instead of the original module makes intent
 * explicit at the call site: "I'm a test, I want to swap the supabase
 * service."
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stub = require("../../shims/supabase-service-stub.cjs") as {
  setTestSupabaseClient: (client: unknown) => void;
  resetTestSupabaseClient: () => void;
  getServiceSupabase: () => unknown;
};

export const setTestSupabaseClient = stub.setTestSupabaseClient;
export const resetTestSupabaseClient = stub.resetTestSupabaseClient;
