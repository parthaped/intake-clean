import "server-only";

import { env, integrations } from "@/lib/env";
import type { AIProvider, OCRProvider } from "@/lib/ai/types";
import { mockAIProvider, mockOCRProvider } from "@/lib/ai/providers/mock-provider";
import type { AIProviderName } from "@/types/database";

/**
 * Resolves the active AI provider for an organization. Falls back to the env
 * default and finally the mock provider so callers always get a value.
 */
export async function getAIProvider(orgPreference?: AIProviderName | null): Promise<AIProvider> {
  const desired: AIProviderName = orgPreference ?? env.aiProvider;

  if (integrations.useMockAi) return mockAIProvider;

  switch (desired) {
    case "huggingface_provider":
    case "huggingface_endpoint": {
      if (!integrations.hasHuggingFace) {
        console.warn("[ai] HF requested but HF_TOKEN/HF_INFERENCE_ENDPOINT_URL missing; using mock");
        return mockAIProvider;
      }
      const { huggingfaceAIProvider } = await import("@/lib/ai/providers/huggingface-provider");
      return huggingfaceAIProvider;
    }
    case "local_ocr_only":
    case "mock":
    default:
      return mockAIProvider;
  }
}

/** Resolves the active OCR provider. */
export async function getOCRProvider(): Promise<OCRProvider> {
  if (integrations.useMockAi || env.ocrEngine === "mock") return mockOCRProvider;
  if (env.ocrEngine === "none" || !env.useLocalOcr) return mockOCRProvider;

  if (env.ocrEngine === "tesseract") {
    const { tesseractOCRProvider } = await import("@/lib/ai/providers/local-tesseract-provider");
    return tesseractOCRProvider;
  }

  // PaddleOCR is reserved for a future microservice integration.
  return mockOCRProvider;
}
