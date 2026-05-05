import "server-only";

import type { VirusScanStatus } from "@/types/database";

export interface VirusScanResult {
  status: VirusScanStatus;
  engine: string | null;
  findings: Record<string, unknown> | null;
}

const CLOUDMERSIVE_ENDPOINT = "https://api.cloudmersive.com/virus/scan/file/advanced";
const SCAN_TIMEOUT_MS = 30_000;

/**
 * Scans a file buffer for malware signatures.
 *
 * Strategy:
 *   - Production: call Cloudmersive's "advanced" virus scan endpoint, which
 *     returns both a generic clean/infected verdict AND structured flags
 *     for executables, scripts, macros, password-protected archives,
 *     OLE/HTML/XML/SVG suspicious content. We treat ANY of those as a hard
 *     reject for files coming through the public upload portal.
 *   - Dev / no key: skip and log a warning. Returning `skipped` keeps the
 *     pipeline moving so local development isn't blocked.
 *
 * The result is intentionally idempotent — calling it again with the same
 * buffer either returns the same verdict or the same `error`. The caller is
 * responsible for persisting the verdict and gating downstream processing.
 *
 * Replace Cloudmersive with ClamAV-as-a-service or VirusTotal (limited) as
 * needed; the interface is designed so any single-call HTTP scanner fits.
 */
export async function scanForViruses(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<VirusScanResult> {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // Production must have a scanner configured. Returning `skipped`
      // would leave a permanent gap in the audit trail; surface as `error`.
      console.error("[virus-scan] CLOUDMERSIVE_API_KEY missing in production");
      return { status: "error", engine: null, findings: { reason: "no_api_key" } };
    }
    console.warn("[virus-scan] CLOUDMERSIVE_API_KEY not set; skipping scan (dev only)");
    return { status: "skipped", engine: null, findings: null };
  }

  const formData = new FormData();
  formData.append("inputFile", new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(CLOUDMERSIVE_ENDPOINT, {
      method: "POST",
      headers: {
        Apikey: apiKey,
        // Strict policy for legal-document uploads: refuse anything that
        // even hints at active content. Cloudmersive accepts these as
        // request headers and returns matching booleans on the response.
        allowExecutables: "false",
        allowInvalidFiles: "false",
        allowScripts: "false",
        allowPasswordProtectedFiles: "false",
        allowMacros: "false",
        allowXmlExternalEntities: "false",
        allowInsecureDeserialization: "false",
        allowHtml: "false",
        // Restrict to the file types we actually accept; anything else is
        // automatically flagged as a content-type policy violation.
        restrictFileTypes: "pdf,jpg,jpeg,png,heic,heif,webp",
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[virus-scan] scanner returned non-200", { status: response.status });
      return { status: "error", engine: "cloudmersive", findings: { http_status: response.status } };
    }

    type CloudmersiveBody = {
      CleanResult?: boolean;
      ContainsExecutable?: boolean;
      ContainsInvalidFile?: boolean;
      ContainsScript?: boolean;
      ContainsPasswordProtectedFile?: boolean;
      ContainsMacros?: boolean;
      ContainsXmlExternalEntities?: boolean;
      ContainsInsecureDeserialization?: boolean;
      ContainsHtml?: boolean;
      ContainsUnsafeArchive?: boolean;
      VerifiedFileFormat?: string | null;
      FoundViruses?: Array<{ FileName?: string; VirusName?: string }> | null;
      ContentInformation?: Record<string, unknown> | null;
    };
    const data = (await response.json()) as CloudmersiveBody;

    const blockingFlags = [
      data.ContainsExecutable,
      data.ContainsInvalidFile,
      data.ContainsScript,
      data.ContainsPasswordProtectedFile,
      data.ContainsMacros,
      data.ContainsXmlExternalEntities,
      data.ContainsInsecureDeserialization,
      data.ContainsHtml,
      data.ContainsUnsafeArchive,
    ];
    const triggered = blockingFlags.some((flag) => flag === true);

    if (data.CleanResult === false || triggered || (data.FoundViruses && data.FoundViruses.length > 0)) {
      return {
        status: "infected",
        engine: "cloudmersive",
        findings: {
          clean: data.CleanResult,
          viruses: data.FoundViruses ?? null,
          flags: {
            executable: data.ContainsExecutable,
            invalid: data.ContainsInvalidFile,
            script: data.ContainsScript,
            password_protected: data.ContainsPasswordProtectedFile,
            macros: data.ContainsMacros,
            xxe: data.ContainsXmlExternalEntities,
            insecure_deserialization: data.ContainsInsecureDeserialization,
            html: data.ContainsHtml,
            unsafe_archive: data.ContainsUnsafeArchive,
          },
          verified_format: data.VerifiedFileFormat ?? null,
        },
      };
    }

    if (data.CleanResult === true) {
      return {
        status: "clean",
        engine: "cloudmersive",
        findings: data.VerifiedFileFormat ? { verified_format: data.VerifiedFileFormat } : null,
      };
    }

    // CleanResult is undefined / null — the scanner accepted the upload but
    // couldn't reach a verdict. Treat as `unknown` so the upload route
    // (production-fail-closed) and process-document (defense-in-depth) can
    // gate on it explicitly. We deliberately do NOT return `clean` here.
    return { status: "unknown", engine: "cloudmersive", findings: data as Record<string, unknown> };
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      return { status: "error", engine: "cloudmersive", findings: { reason: "timeout" } };
    }
    console.error("[virus-scan] scan call failed", error);
    return {
      status: "error",
      engine: "cloudmersive",
      findings: { reason: error instanceof Error ? error.message : "unknown" },
    };
  } finally {
    clearTimeout(timer);
  }
}
