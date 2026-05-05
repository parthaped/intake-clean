/**
 * Validates the optional `?next=` query parameter on auth callbacks so that an
 * attacker who can craft a Supabase recovery / magic-link URL cannot redirect
 * the user to an off-site location after the code exchange.
 *
 * The previous implementation only checked `value.startsWith("/")`, which is
 * NOT sufficient: protocol-relative URLs (`//evil.example.com/x`) and
 * back-slash variants (`/\evil.example.com`, parsed as `//evil...` by the URL
 * parser in some browsers) ALSO start with `/` and are then resolved by
 * `new URL(value, origin)` to a different host — a textbook open redirect.
 *
 * Rules enforced here:
 *   1. Must be a string (not null / undefined).
 *   2. Must start with a single forward slash (no scheme, no `//`, no `/\`).
 *   3. Must NOT be a `javascript:` / `data:` / `vbscript:` style payload.
 *   4. Must round-trip through `new URL` against a sentinel origin and produce
 *      the SAME origin — defence-in-depth in case the parser normalises a
 *      sneaky escape we didn't anticipate.
 *
 * Returns the safe path on success, or `null` if the input would escape the
 * application's origin. Callers should use a deterministic in-app fallback
 * (e.g. `/dashboard`) when this returns `null`.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;

  // Must look like an absolute in-app path.
  if (!value.startsWith("/")) return null;

  // Reject protocol-relative URLs (`//evil`, `///evil`, ...) and the
  // back-slash trick (`/\evil`, which several URL parsers treat as `//evil`).
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // Reject any scheme prefix snuck in via percent-encoding or the like.
  // This is paranoia — a leading `/` excludes most schemes — but cheap.
  const lowered = value.toLowerCase();
  if (
    lowered.includes("javascript:") ||
    lowered.includes("data:") ||
    lowered.includes("vbscript:")
  ) {
    return null;
  }

  // Final defence-in-depth: ensure the value resolves to the same origin
  // when interpreted as a URL. We use a sentinel origin that an attacker
  // cannot control; if the resulting URL's origin differs, the input was
  // dangerous.
  const sentinel = "https://intakeclean.invalid";
  let resolved: URL;
  try {
    resolved = new URL(value, sentinel);
  } catch {
    return null;
  }
  if (resolved.origin !== sentinel) return null;

  // Re-emit pathname + search + hash so callers always get a normalised
  // value. Strips redundant leading slashes that snuck through the regex
  // checks (`new URL` collapses them but we want belt-and-braces).
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
