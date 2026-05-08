/**
 * Static-content map for the public legal policies.
 *
 * Each markdown file is imported via webpack's `asset/source` rule (see
 * `next.config.ts`), which inlines the file content as a string into the
 * built bundle. This means the runtime page (`src/app/legal/[slug]/page.tsx`)
 * never has to `readFile` from disk — the markdown is part of the function
 * code itself, so we don't depend on `outputFileTracingIncludes` correctly
 * picking up the path during NFT.
 *
 * Build-time consumers that DO have direct disk access (the PDF builder in
 * `scripts/build-legal-pdfs.ts`) keep using `LegalDocument.markdownPath`
 * with `readFile`, since they run under tsx not webpack.
 *
 * Keys are document slugs (matching `LEGAL_DOCUMENTS[i].slug`).
 */
import termsOfService from "../../legal/policies/01-terms-of-service.md";
import privacyPolicy from "../../legal/policies/02-privacy-policy.md";
import dataProcessingAddendum from "../../legal/policies/03-data-processing-addendum.md";
import acceptableUsePolicy from "../../legal/policies/04-acceptable-use-policy.md";
import cookieNotice from "../../legal/policies/05-cookie-notice.md";
import aiDisclaimer from "../../legal/policies/06-ai-disclaimer.md";
import subprocessorList from "../../legal/policies/07-subprocessor-list.md";

export const LEGAL_POLICY_MARKDOWN: Readonly<Record<string, string>> = {
  "terms-of-service": termsOfService,
  "privacy-policy": privacyPolicy,
  "data-processing-addendum": dataProcessingAddendum,
  "acceptable-use-policy": acceptableUsePolicy,
  "cookie-notice": cookieNotice,
  "ai-disclaimer": aiDisclaimer,
  "subprocessor-list": subprocessorList,
} as const;
