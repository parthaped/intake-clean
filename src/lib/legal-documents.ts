/**
 * Single source of truth for the public-facing legal documents.
 *
 * Used by:
 *   - `src/app/legal/page.tsx`              — index page listing every document
 *   - `src/app/legal/[slug]/page.tsx`       — readable HTML view per document
 *   - `scripts/build-legal-pdfs.ts`         — generator that writes PDFs into
 *                                             `public/legal/<slug>.pdf`
 *
 * **Do not list private documents here** (operating agreement, IP assignment,
 * NDA template, contractor agreement, invention disclosure, provisional patent
 * application). Those live under `legal/formation/` and `legal/ip/` and must
 * never be exposed publicly.
 */

export interface LegalDocument {
  /** URL slug under `/legal/` and the PDF filename stem in `public/legal/`. */
  slug: string;
  /** Title shown in the index, the HTML view, and the PDF cover. */
  title: string;
  /** One-line description shown in the index card. */
  description: string;
  /** Path to the markdown source, relative to the project root. */
  markdownPath: string;
  /**
   * Display order. Lower numbers appear first. Mirrors the contractual order
   * of precedence in the Terms of Service ("ToS, then DPA, then AUP, then
   * Privacy, then everything else").
   */
  order: number;
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    description:
      "The master B2B SaaS contract between IntakeClean and the firm using the product. Includes acceptable use, AI assistive language, fees, governing law, and arbitration.",
    markdownPath: "legal/policies/01-terms-of-service.md",
    order: 1,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    description:
      "How we collect, use, share, and protect information. Covers both firm representatives (controller scope) and uploaded end-client documents (processor scope).",
    markdownPath: "legal/policies/02-privacy-policy.md",
    order: 2,
  },
  {
    slug: "data-processing-addendum",
    title: "Data Processing Addendum",
    description:
      "GDPR / CCPA processing terms when IntakeClean handles personal data on a firm's behalf. Standard Contractual Clauses incorporated for international transfers.",
    markdownPath: "legal/policies/03-data-processing-addendum.md",
    order: 3,
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    description:
      "Prohibited content and behavior on IntakeClean. Incorporated by reference into the Terms of Service.",
    markdownPath: "legal/policies/04-acceptable-use-policy.md",
    order: 4,
  },
  {
    slug: "subprocessor-list",
    title: "Subprocessor List",
    description:
      "The current set of third-party providers we engage to deliver the service, with the categories of data each receives. Updated when subprocessors change.",
    markdownPath: "legal/policies/07-subprocessor-list.md",
    order: 5,
  },
  {
    slug: "ai-disclaimer",
    title: "AI Output Disclaimer",
    description:
      "What our AI does, what it cannot do, and the firm's responsibility to review every automated output before relying on it.",
    markdownPath: "legal/policies/06-ai-disclaimer.md",
    order: 6,
  },
  {
    slug: "cookie-notice",
    title: "Cookie Notice",
    description:
      "Cookies and similar technologies used on the IntakeClean website and product, by category and purpose.",
    markdownPath: "legal/policies/05-cookie-notice.md",
    order: 7,
  },
] as const;

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
}
