/* eslint-disable @typescript-eslint/no-require-imports */
// CommonJS bootstrap that runs AFTER tsx's CJS hook has been installed
// (we pass `--require ./tests/bootstrap.cjs` after `--import tsx` in the
// npm scripts). Patches Module._resolveFilename so that any CJS-side
// `require("server-only")` is redirected to our empty shim — needed
// because tsx compiles our .ts source to CJS, where the side-effect
// `import "server-only"` becomes a runtime `require`.
//
// Also redirects `@/lib/supabase/service` to a test stub so unit tests can
// inject a fake `getServiceSupabase`. tsx (esbuild) compiles the real
// service module's exports to non-configurable getters, which makes
// Jasmine's `spyOn` impossible. Routing the import through a CJS stub
// gives us a writable indirection without polluting prod code.

const path = require("node:path");
const Module = require("node:module");

const SERVER_ONLY_SHIM = path.resolve(__dirname, "shims", "server-only.cjs");
const SUPABASE_SERVICE_STUB = path.resolve(__dirname, "shims", "supabase-service-stub.cjs");
const SUPABASE_SERVICE_REAL = path.resolve(
  __dirname,
  "..",
  "src",
  "lib",
  "supabase",
  "service.ts",
);
const PROCESS_DOCUMENT_STUB = path.resolve(__dirname, "shims", "process-document-stub.cjs");
const PROCESS_DOCUMENT_REAL = path.resolve(
  __dirname,
  "..",
  "src",
  "lib",
  "ai",
  "process-document.ts",
);
const BOTID_SERVER_STUB = path.resolve(__dirname, "shims", "botid-server-stub.cjs");
const VIRUS_SCAN_STUB = path.resolve(__dirname, "shims", "virus-scan-stub.cjs");
const VIRUS_SCAN_REAL = path.resolve(
  __dirname,
  "..",
  "src",
  "lib",
  "security",
  "virus-scan.ts",
);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
  if (request === "server-only") return SERVER_ONLY_SHIM;
  // Redirect both the path-aliased form and the resolved absolute path so
  // every consumer — whether it imports `@/lib/supabase/service` (most of
  // the codebase) or a relative `../supabase/service` (none today, but
  // would-be-fine) — lands on the same stub.
  if (request === "@/lib/supabase/service") return SUPABASE_SERVICE_STUB;
  if (request === "@/lib/ai/process-document" && !isProcessDocumentUnitTest(parent)) {
    return PROCESS_DOCUMENT_STUB;
  }
  if (request === "botid/server") return BOTID_SERVER_STUB;
  // The dedicated `virus-scan.spec.ts` exercises the REAL module via a
  // stubbed `fetch`. Other callers — route handlers, processDocument —
  // want a controllable seam, so we only redirect away from the real
  // module when the requesting code is not the unit test itself.
  if (request === "@/lib/security/virus-scan" && !isVirusScanUnitTest(parent)) {
    return VIRUS_SCAN_STUB;
  }
  try {
    const resolved = originalResolve.call(this, request, parent, ...rest);
    if (resolved === SUPABASE_SERVICE_REAL) return SUPABASE_SERVICE_STUB;
    if (resolved === PROCESS_DOCUMENT_REAL && !isProcessDocumentUnitTest(parent)) {
      return PROCESS_DOCUMENT_STUB;
    }
    if (resolved === VIRUS_SCAN_REAL && !isVirusScanUnitTest(parent)) {
      return VIRUS_SCAN_STUB;
    }
    return resolved;
  } catch (err) {
    throw err;
  }
};

// `tests/jasmine/spec/security/virus-scan.spec.ts` imports the real
// implementation directly (it's the one place that wants to assert on
// Cloudmersive's verdict mapping). We don't redirect for that file so
// the spec can do its job.
function isVirusScanUnitTest(parent) {
  if (!parent || !parent.filename) return false;
  return parent.filename.endsWith("virus-scan.spec.ts");
}

// Same idea for the dedicated process-document unit test: it imports the
// real orchestrator and stubs every dependency below it.
function isProcessDocumentUnitTest(parent) {
  if (!parent || !parent.filename) return false;
  return parent.filename.endsWith("process-document.spec.ts");
}
