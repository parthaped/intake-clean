/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test-only replacement for `@/lib/security/virus-scan`. The real
 * implementation calls Cloudmersive over HTTP. Pipeline / route tests
 * want to cover the verdict matrix (clean / infected / unknown / error)
 * without depending on the network or an API key.
 *
 * Default verdict is `clean` so tests that don't care can skip wiring.
 * Tests that need the infected branch call `setScanVerdict({ status:
 * "infected", engine: "cloudmersive", findings: { ... } })`.
 *
 * The dedicated unit tests in `tests/jasmine/spec/security/virus-scan.spec.ts`
 * exercise the real implementation with a stubbed `fetch`, so this shim
 * is never the source-of-truth for what Cloudmersive does — it's a
 * controllable seam for *callers*.
 */
let verdict = { status: "clean", engine: "cloudmersive", findings: null };
const calls = [];

async function scanForViruses(buffer, mime, filename) {
  calls.push({ size: buffer?.length ?? 0, mime, filename });
  return verdict;
}

function setScanVerdict(next) {
  verdict = next;
}

function resetScanVerdict() {
  verdict = { status: "clean", engine: "cloudmersive", findings: null };
  calls.length = 0;
}

function scanCalls() {
  return calls;
}

module.exports = {
  scanForViruses,
  setScanVerdict,
  resetScanVerdict,
  scanCalls,
};
