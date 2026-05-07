import path from "node:path";
import { pathToFileURL } from "node:url";

// Map any import of "server-only" to our empty shim so source files marked
// `import "server-only"` can be loaded by a plain Node test runner.
const shimUrl = pathToFileURL(
  path.resolve(new URL(".", import.meta.url).pathname, "shims", "server-only.cjs"),
).href;

// Redirect `@/lib/supabase/service` to a test stub so tests can install a
// fake `getServiceSupabase` per-spec. See `tests/bootstrap.cjs` for the
// matching CJS-side patch that catches `require()` callers.
const supabaseStubUrl = pathToFileURL(
  path.resolve(
    new URL(".", import.meta.url).pathname,
    "shims",
    "supabase-service-stub.cjs",
  ),
).href;

// Same idea for `@/lib/ai/process-document` — pipeline tests want to drive
// drainProcessingQueue with a hand-rolled implementation rather than the
// real (heavy) orchestrator that decodes images and calls AI providers.
const processDocumentStubUrl = pathToFileURL(
  path.resolve(
    new URL(".", import.meta.url).pathname,
    "shims",
    "process-document-stub.cjs",
  ),
).href;

const botIdStubUrl = pathToFileURL(
  path.resolve(new URL(".", import.meta.url).pathname, "shims", "botid-server-stub.cjs"),
).href;

const virusScanStubUrl = pathToFileURL(
  path.resolve(new URL(".", import.meta.url).pathname, "shims", "virus-scan-stub.cjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: shimUrl, format: "commonjs", shortCircuit: true };
  }
  if (specifier === "@/lib/supabase/service") {
    return { url: supabaseStubUrl, format: "commonjs", shortCircuit: true };
  }
  if (specifier === "@/lib/ai/process-document") {
    const parent = context?.parentURL ?? "";
    if (!parent.endsWith("/process-document.spec.ts")) {
      return { url: processDocumentStubUrl, format: "commonjs", shortCircuit: true };
    }
  }
  if (specifier === "botid/server") {
    return { url: botIdStubUrl, format: "commonjs", shortCircuit: true };
  }
  // Mirror the bootstrap.cjs carve-out: the dedicated virus-scan.spec.ts
  // imports the real implementation; everything else goes through the
  // stub. `context.parentURL` is the importer.
  if (specifier === "@/lib/security/virus-scan") {
    const parent = context?.parentURL ?? "";
    if (!parent.endsWith("/virus-scan.spec.ts")) {
      return { url: virusScanStubUrl, format: "commonjs", shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
