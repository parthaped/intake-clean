import "server-only";

import { createWorker, type Worker } from "tesseract.js";

import type { OCRProvider, OCRResult } from "@/lib/ai/types";

const OCR_TIMEOUT_MS = 30_000;

let workerPromise: Promise<Worker> | null = null;
let workerLang = "eng";
/**
 * Tesseract.js workers are stateful and a single worker can process exactly
 * one `recognize` call at a time. Two concurrent processing jobs hitting
 * `recognize()` on the same worker would interleave PSM/OEM state and
 * corrupt the second result. We therefore serialise calls through a tiny
 * promise chain so the second call awaits the first.
 */
let workerLock: Promise<unknown> = Promise.resolve();

/**
 * Lazily creates (and memoises) a single tesseract.js worker per Node process.
 * Each worker holds ~50MB; we never want two living simultaneously. The first
 * call downloads the language traineddata (~10MB for `eng`) into the local
 * cache directory used by tesseract.js.
 */
async function getWorker(lang: string): Promise<Worker> {
  if (workerPromise && workerLang === lang) return workerPromise;
  if (workerPromise) {
    const old = workerPromise;
    workerPromise = null;
    // Don't recycle the old worker until any in-flight `recognize` against
    // it has settled — terminating mid-call leaves dangling tasks that
    // never resolve.
    void workerLock.then(() => old.then((w) => w.terminate()).catch(() => {}));
  }
  workerLang = lang;
  workerPromise = (async () => {
    const worker = await createWorker(lang);
    return worker;
  })();
  return workerPromise;
}

/**
 * Drop the current worker reference. The next call to `getWorker` will spin
 * up a fresh worker. Used after a timeout because the previous worker is
 * very likely still busy (tesseract.js doesn't support cancelling an
 * in-flight `recognize`) and reusing it would deadlock the queue.
 */
function poisonWorker(): void {
  if (!workerPromise) return;
  const old = workerPromise;
  workerPromise = null;
  void workerLock.then(() => old.then((w) => w.terminate()).catch(() => {}));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let handle: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([
    promise.finally(() => {
      if (handle) clearTimeout(handle);
    }),
    timeout,
  ]);
}

export const tesseractOCRProvider: OCRProvider = {
  engine: "tesseract",
  async ocr({ buffer, mime, lang }): Promise<OCRResult> {
    if (mime === "application/pdf") {
      // tesseract.js can't OCR PDFs directly; rasterising is out-of-scope for
      // the MVP. Return an empty result so the orchestrator can fall back to
      // rules-by-filename / checklist title.
      return { text: "", confidence: 0, engine: "tesseract", pages: 1, rawJson: { skipped: "pdf" }, durationMs: 0 };
    }
    const useLang = lang ?? "eng";
    const start = Date.now();

    // Serialise concurrent OCR calls. Without this, two pipeline jobs that
    // overlap would race on a single worker and either return corrupted
    // text or hang indefinitely. The chain swallows previous-call errors
    // so one failure doesn't poison the queue for everyone after it.
    const previous = workerLock.catch(() => undefined);
    let resolveSelf: () => void;
    workerLock = new Promise<void>((resolve) => {
      resolveSelf = resolve;
    });

    try {
      await previous;
      const worker = await getWorker(useLang);
      try {
        const { data } = await withTimeout(
          worker.recognize(buffer),
          OCR_TIMEOUT_MS,
          "tesseract.recognize",
        );
        const confidence = typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence / 100)) : 0;
        return {
          text: (data.text ?? "").trim(),
          confidence,
          engine: "tesseract",
          pages: 1,
          rawJson: {
            provider: "tesseract.js",
            lang: useLang,
            confidence,
            textLength: (data.text ?? "").length,
          },
          durationMs: Date.now() - start,
        };
      } catch (error) {
        // After a timeout (or any internal worker failure) the worker is
        // very likely wedged. Replace it before the next call so the queue
        // doesn't immediately re-time-out against the same dead worker.
        if (error instanceof Error && error.message.includes("timed out")) {
          poisonWorker();
        }
        console.error("[tesseract] OCR failed", error);
        return {
          text: "",
          confidence: 0,
          engine: "tesseract",
          pages: 1,
          rawJson: { error: error instanceof Error ? error.message : String(error) },
          durationMs: Date.now() - start,
        };
      }
    } finally {
      resolveSelf!();
    }
  },
};
