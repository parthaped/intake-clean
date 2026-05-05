/* eslint-disable @typescript-eslint/no-require-imports */
// CommonJS bootstrap that runs AFTER tsx's CJS hook has been installed
// (we pass `--require ./tests/bootstrap.cjs` after `--import tsx` in the
// npm scripts). Patches Module._resolveFilename so that any CJS-side
// `require("server-only")` is redirected to our empty shim — needed
// because tsx compiles our .ts source to CJS, where the side-effect
// `import "server-only"` becomes a runtime `require`.

const path = require("node:path");
const Module = require("node:module");

const SHIM_PATH = path.resolve(__dirname, "shims", "server-only.cjs");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
  if (request === "server-only") return SHIM_PATH;
  return originalResolve.call(this, request, parent, ...rest);
};
