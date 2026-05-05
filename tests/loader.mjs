import path from "node:path";
import { pathToFileURL } from "node:url";

// Map any import of "server-only" to our empty shim so source files marked
// `import "server-only"` can be loaded by a plain Node test runner.
const shimUrl = pathToFileURL(
  path.resolve(new URL(".", import.meta.url).pathname, "shims", "server-only.cjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: shimUrl, format: "commonjs", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
