import { randomBytes } from "node:crypto";

/**
 * Returns a 256-bit URL-safe token used as the public identifier for a
 * document_request. The combination of length and base64url encoding makes the
 * token effectively unguessable while remaining safe for query strings.
 */
export function generateRequestToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Generates an unguessable storage object key under a per-org prefix. */
export function buildStorageKey(parts: {
  organizationId: string;
  matterId: string;
  scope: "original" | "processed" | "thumbnail" | "export";
  filename: string;
}): string {
  const safe = parts.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `${parts.organizationId}/${parts.matterId}/${parts.scope}/${stamp}-${rand}-${safe}`;
}
