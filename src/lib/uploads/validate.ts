import "server-only";

import { fileTypeFromBuffer } from "file-type";

import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/constants";

/**
 * Server-side validation for uploaded files.
 *
 * The client supplies a MIME type via the `File` object, but that value is
 * trivially forgeable (browsers derive it from the file extension, and an
 * attacker controlling the request body can claim anything). For documents
 * that contain passports, SSNs, and similar PII we cannot trust it.
 *
 * Instead we sniff the first ~4 KB of the buffer for a magic byte signature
 * and confirm:
 *   1. The detected type matches one of our accepted MIME types.
 *   2. The detected type matches what the client claimed (no polyglot tricks
 *      where a `.pdf` is actually a Windows executable).
 *
 * HEIC / HEIF do not always have a stable signature `file-type` recognises
 * for every encoder, so we accept either iOS variant when the claimed type
 * is one of the heic family. Plain text and other unrecognised payloads are
 * always rejected.
 */
export interface UploadValidation {
  ok: boolean;
  status: number;
  message?: string;
  detectedMime?: string;
}

const HEIC_FAMILY = new Set(["image/heic", "image/heif"]);

const COMPATIBLE_MIME_PAIRS: Array<[string, string]> = [
  // file-type sometimes returns "image/jpeg" for files claimed as image/jpg.
  ["image/jpeg", "image/jpg"],
  ["image/jpg", "image/jpeg"],
];

function mimesAreCompatible(claimed: string, detected: string): boolean {
  if (claimed === detected) return true;
  if (HEIC_FAMILY.has(claimed) && HEIC_FAMILY.has(detected)) return true;
  return COMPATIBLE_MIME_PAIRS.some(([a, b]) => claimed === a && detected === b);
}

export async function validateUploadedFile(file: File): Promise<UploadValidation> {
  if (file.size === 0) {
    return { ok: false, status: 400, message: "File is empty" };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, status: 413, message: "File is over 50 MB" };
  }
  const claimedMime = (file.type || "").toLowerCase();
  if (!ACCEPTED_FILE_TYPES.includes(claimedMime as (typeof ACCEPTED_FILE_TYPES)[number])) {
    return { ok: false, status: 415, message: "File type not accepted" };
  }

  // Sniff the leading bytes. file-type only needs ~4 KB to identify every
  // format we accept; reading more is wasted work.
  const head = new Uint8Array(await file.slice(0, 4100).arrayBuffer());
  const detected = await fileTypeFromBuffer(head);

  // Some HEIC encoders produce frames file-type can't classify. We only
  // accept "unknown" when the claimed type is HEIC/HEIF AND the magic
  // contains the iOS `ftypheic`/`ftypheix`/`ftypmif1`/`ftyphevc` brands.
  if (!detected) {
    if (HEIC_FAMILY.has(claimedMime) && looksLikeHeic(head)) {
      return { ok: true, status: 200, detectedMime: claimedMime };
    }
    return { ok: false, status: 415, message: "File contents do not match an accepted document type" };
  }

  if (!ACCEPTED_FILE_TYPES.includes(detected.mime as (typeof ACCEPTED_FILE_TYPES)[number])) {
    return {
      ok: false,
      status: 415,
      message: `Detected content type "${detected.mime}" is not allowed`,
      detectedMime: detected.mime,
    };
  }

  if (!mimesAreCompatible(claimedMime, detected.mime)) {
    return {
      ok: false,
      status: 415,
      message: `Declared type "${claimedMime}" does not match detected type "${detected.mime}"`,
      detectedMime: detected.mime,
    };
  }

  return { ok: true, status: 200, detectedMime: detected.mime };
}

function looksLikeHeic(bytes: Uint8Array): boolean {
  // ISO BMFF box header starts at offset 4 with the "ftyp" tag, followed by
  // a 4-byte brand. We accept the common HEIF brands plus the generic
  // mif1 / heic / heix / hevc.
  if (bytes.length < 12) return false;
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["heic", "heix", "hevc", "mif1", "msf1", "heim", "heis"].includes(brand);
}
