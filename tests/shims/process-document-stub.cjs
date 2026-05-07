/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test-only replacement for `@/lib/ai/process-document`.
 *
 * The real implementation downloads the original from Supabase storage,
 * decodes the bytes via sharp/pdf-lib, optionally calls Hugging Face, and
 * persists rows across multiple tables. Pipeline-layer tests don't care
 * about any of that; they care that:
 *   - successful `processDocument` → drainer marks the job completed,
 *   - thrown `processDocument` → drainer re-queues or fails the job
 *     and (for terminal failures) flips the file row to needs_review.
 *
 * So tests inject the implementation explicitly via
 * `setProcessDocumentImpl(fn)`. The default throws to make a missed setup
 * loud rather than silently returning a stale verdict.
 */

let impl = null;

async function processDocument(args) {
  if (!impl) {
    throw new Error(
      "[test-stub] processDocument() called without an implementation installed. " +
        "Use setProcessDocumentImpl(fn) in beforeEach.",
    );
  }
  return impl(args);
}

function setProcessDocumentImpl(fn) {
  impl = fn;
}

function resetProcessDocumentImpl() {
  impl = null;
}

module.exports = {
  processDocument,
  setProcessDocumentImpl,
  resetProcessDocumentImpl,
};
