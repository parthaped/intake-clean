/**
 * Typed bridges to the stubs used by upload-route + processDocument tests.
 * Each bridge re-exports the stub's setters/resetters with proper TS
 * types so call sites stay readable.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const botIdStub = require("../../shims/botid-server-stub.cjs") as {
  setBotIdVerdict: (next: { isBot: boolean }) => void;
  resetBotIdVerdict: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const virusStub = require("../../shims/virus-scan-stub.cjs") as {
  setScanVerdict: (next: {
    status: "clean" | "infected" | "skipped" | "error" | "unknown";
    engine: string | null;
    findings: Record<string, unknown> | null;
  }) => void;
  resetScanVerdict: () => void;
  scanCalls: () => Array<{ size: number; mime: string; filename: string }>;
};

export const setBotIdVerdict = botIdStub.setBotIdVerdict;
export const resetBotIdVerdict = botIdStub.resetBotIdVerdict;

export const setScanVerdict = virusStub.setScanVerdict;
export const resetScanVerdict = virusStub.resetScanVerdict;
export const scanCalls = virusStub.scanCalls;
