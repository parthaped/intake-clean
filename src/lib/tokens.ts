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
  // Sanitize in two passes:
  //   1) Drop any character outside [A-Za-z0-9._-] (notably '/', '\', and
  //      whitespace) so the user-supplied filename can never widen into
  //      additional storage path segments.
  //   2) Collapse any run of two-or-more dots ('..', '...', etc.) to a
  //      single '_'. This is defense-in-depth: even though step (1) has
  //      already removed slashes, downstream tools that re-parse storage
  //      keys for display, ZIP entries, or local extraction shouldn't be
  //      handed a literal '..' substring originating from client input.
  const safe = parts.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  const stamp = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `${parts.organizationId}/${parts.matterId}/${parts.scope}/${stamp}-${rand}-${safe}`;
}
