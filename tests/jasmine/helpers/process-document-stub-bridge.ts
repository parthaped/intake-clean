/**
 * Typed bridge to `tests/shims/process-document-stub.cjs`. Tests use this
 * to install a hand-rolled `processDocument` implementation per-spec.
 * The matching `bootstrap.cjs` / `loader.mjs` redirect makes the bridge
 * the source-of-truth for any code path that imports
 * `@/lib/ai/process-document`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stub = require("../../shims/process-document-stub.cjs") as {
  setProcessDocumentImpl: (fn: ProcessDocumentFn) => void;
  resetProcessDocumentImpl: () => void;
};

export type ProcessDocumentFn = (args: {
  uploadedFileId: string;
  organizationId: string;
}) => Promise<{
  uploadedFileId: string;
  provider: string;
  ocrEngine: string;
  status: string;
  detectedDocumentType: string | null;
  classificationSource: string;
  hfModelUsed: string | null;
  latencyMs: number;
}>;

export const setProcessDocumentImpl = stub.setProcessDocumentImpl;
export const resetProcessDocumentImpl = stub.resetProcessDocumentImpl;
