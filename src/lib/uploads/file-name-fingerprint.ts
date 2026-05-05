import { createHash } from "node:crypto";

/**
 * Returns a stable, non-reversible fingerprint of a filename, plus the
 * lowercased extension (without the leading dot).
 *
 * Why: filenames frequently leak PII on their own — clients send things like
 * `passport_john_smith_ssn_123456789.pdf`. We still want audit trails to
 * uniquely identify a file across events, but we don't want raw names sitting
 * in the audit log. SHA-256 of the original name gives us join-ability
 * without disclosure.
 */
export function fingerprintFileName(name: string): { sha256: string; ext: string } {
  const sha256 = createHash("sha256").update(name).digest("hex");
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
  return { sha256, ext };
}
