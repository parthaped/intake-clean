import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  LEGAL_BRAND,
  LEGAL_DOCUMENTS,
  applyLegalSubstitutions,
  findLegalDocument,
} from "@/lib/legal-documents";

/**
 * Regression tests for the legal-document substitution helper. The
 * `[slug]` page renders dynamically (because the marketing shell reads
 * cookies/headers), so a single broken substitution is what shipped the
 * cookie notice as a 500 in production. We pin the behaviour here:
 *
 *   - the cookie-notice markdown still exists on disk and is non-empty,
 *   - every placeholder token is replaced for at least the cookie notice,
 *   - the substitution does not corrupt the more-specific email tokens
 *     when the bare `[CONTACT EMAIL]` token also appears in a document.
 */
describe("legal: applyLegalSubstitutions", () => {
  it("replaces every documented placeholder in the cookie notice", async () => {
    const doc = findLegalDocument("cookie-notice");
    expect(doc).withContext("cookie-notice doc must be registered").toBeDefined();
    if (!doc) return;

    const absolute = join(process.cwd(), doc.markdownPath);
    const source = await readFile(absolute, "utf8");

    const filled = applyLegalSubstitutions(source, doc);

    expect(filled).not.toContain("[YYYY-MM-DD]");
    expect(filled).not.toContain("[LLC NAME]");
    expect(filled).not.toContain("[privacy@CONTACT EMAIL]");
    expect(filled).toContain(doc.lastUpdated);
    expect(filled).toContain(LEGAL_BRAND.llcName);
    expect(filled).toContain(LEGAL_BRAND.privacyEmail);
  });

  it("does not leave a literal '[CONTACT EMAIL]' bracket pair in any registered document", async () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const absolute = join(process.cwd(), doc.markdownPath);
      const source = await readFile(absolute, "utf8");
      const filled = applyLegalSubstitutions(source, doc);
      expect(filled)
        .withContext(doc.slug)
        .not.toMatch(/\[(privacy|security|support|abuse)?@?CONTACT EMAIL\]/);
    }
  });

  it("substitutes specific email tokens before the bare token (no nested replacement)", () => {
    const sample = [
      "[CONTACT EMAIL]",
      "[privacy@CONTACT EMAIL]",
      "[security@CONTACT EMAIL]",
    ].join(" / ");

    const filled = applyLegalSubstitutions(sample, { lastUpdated: "2026-05-06" });

    // None of the role-prefixed tokens should be partially replaced — a
    // naive `replaceAll('[CONTACT EMAIL]', …)` ahead of the prefixed
    // tokens would leave `[privacy@privacy@intakeclean.com]` behind.
    expect(filled).toBe(
      `${LEGAL_BRAND.legalEmail} / ${LEGAL_BRAND.privacyEmail} / ${LEGAL_BRAND.securityEmail}`,
    );
  });

  it("substitutes the per-document lastUpdated date into the [YYYY-MM-DD] token", () => {
    const filled = applyLegalSubstitutions(
      "Last updated: [YYYY-MM-DD]. Effective: [YYYY-MM-DD].",
      { lastUpdated: "2026-05-06" },
    );
    expect(filled).toBe("Last updated: 2026-05-06. Effective: 2026-05-06.");
  });
});
