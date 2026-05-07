/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test-only replacement for `@/lib/supabase/service`.
 *
 * The production module exports `getServiceSupabase()` which constructs a
 * real `@supabase/supabase-js` client and caches it in module scope. tsx
 * compiles the `export` to a non-configurable getter, so we cannot use
 * Jasmine's `spyOn` to swap the function. Instead, the test bootstrap
 * (`tests/bootstrap.cjs`) redirects `Module._resolveFilename` for
 * `@/lib/supabase/service` to this CJS stub so every consumer (route
 * handlers, audit log, processing queue, pipeline, processDocument) gets
 * the same configurable `getServiceSupabase` function.
 *
 * Tests inject their fake client via the helpers exported here:
 *   - `setTestSupabaseClient(client)` — install for the current spec.
 *   - `resetTestSupabaseClient()` — clear in `afterEach` so a leak in one
 *     spec doesn't bleed into the next.
 */

let activeClient = null;

function getServiceSupabase() {
  if (!activeClient) {
    throw new Error(
      "[test-stub] getServiceSupabase() called without a fake client installed. " +
        "Use setTestSupabaseClient(fake.client) in beforeEach.",
    );
  }
  return activeClient;
}

function setTestSupabaseClient(client) {
  activeClient = client;
}

function resetTestSupabaseClient() {
  activeClient = null;
}

module.exports = {
  getServiceSupabase,
  setTestSupabaseClient,
  resetTestSupabaseClient,
};
