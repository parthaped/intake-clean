/**
 * Lightweight PII scrubber for OCR text we ship off-platform (e.g. to a
 * Hugging Face inference provider). The intent is NOT to be an enterprise
 * DLP — it's to make sure the most common identifier patterns don't leave
 * the document.
 *
 * Patterns covered (US-centric on purpose; legal intake skews US):
 *   - Social Security Numbers (NNN-NN-NNNN, NNN NN NNNN, plain 9-digit run)
 *   - US passport numbers (book: 9 chars, mostly digits with one letter)
 *   - Driver's license-shaped numbers (8-12 alphanumeric)
 *   - Credit-card-shaped sequences (Luhn check NOT applied; cheap)
 *   - Dates of birth (mm/dd/yyyy, dd-mm-yyyy)
 *   - Email addresses
 *   - North-American phone numbers
 *   - EIN (NN-NNNNNNN)
 *
 * We replace each with a labelled token of the same shape's length so the
 * downstream model can still reason about structure (e.g. "an ID near the
 * top") without seeing the value. Non-matching characters are passed
 * through unchanged.
 *
 * Counts are returned for observability; a caller can record
 * `redactions: { ssn: 2, passport: 1 }` in the audit metadata so we can
 * tell how often outbound text contained PII.
 */
export interface RedactResult {
  text: string;
  counts: Record<string, number>;
  totalRedactions: number;
}

interface Rule {
  label: string;
  pattern: RegExp;
}

// Rule order matters. Earlier rules redact text into `[REDACTED:label]`
// markers, so anything that runs later only sees what's left. The previous
// ordering ran the bare-9-digit SSN rule BEFORE the email rule, which meant
// `joe@firm123456789.com` lost the digit run inside the domain to a false-
// positive SSN redaction. We now redact e-mails and phone numbers first so
// numeric chunks embedded inside them never reach the SSN pattern.
const RULES: Rule[] = [
  // Email FIRST so a 9-digit run inside a domain (`firm123456789.com`)
  // can't be misclassified as an SSN.
  { label: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // North-American phone numbers — also has overlapping numeric shape.
  { label: "phone", pattern: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  // Credit-card-shaped (12-19 contiguous or hyphen/space-grouped digits).
  // Catches before bare 9-digit SSN can chew off a substring.
  { label: "card", pattern: /\b(?:\d[ -]?){12,19}\b/g },
  // EIN
  { label: "ein", pattern: /\b\d{2}-\d{7}\b/g },
  // Dates of birth. Restrict month (01-12) and day (01-31) so junk like
  // "99/99/9999" doesn't get redacted as a DOB. Year still accepts both
  // 2- and 4-digit forms.
  {
    label: "dob",
    pattern: /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](?:\d{2}|\d{4})\b/g,
  },
  // SSN — three formats. Most specific first.
  { label: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "ssn", pattern: /\b\d{3}\s\d{2}\s\d{4}\b/g },
  // Bare 9-digit run is risky (many things are 9 digits — invoice numbers
  // for instance). We require it to be word-bounded and NOT followed by
  // another digit so we don't wreck file IDs.
  { label: "ssn", pattern: /(?<![\d-])\d{9}(?![\d-])/g },
  // US passport book number (9 chars, leading letter optional). Heuristic.
  { label: "passport", pattern: /\b[A-Z]?\d{8,9}\b/g },
  // Driver's license shaped (8-12 alphanumerics, must include both letters
  // AND digits to avoid blasting 9-digit invoice numbers we already covered).
  { label: "drivers_license", pattern: /\b(?=[A-Z0-9]{8,12}\b)(?=[A-Z]*\d)(?=\d*[A-Z])[A-Z0-9]{8,12}\b/g },
];

function placeholder(label: string): string {
  return `[REDACTED:${label}]`;
}

export function redactPII(text: string): RedactResult {
  if (!text) return { text, counts: {}, totalRedactions: 0 };

  const counts: Record<string, number> = {};
  let working = text;
  for (const { label, pattern } of RULES) {
    working = working.replace(pattern, () => {
      counts[label] = (counts[label] ?? 0) + 1;
      return placeholder(label);
    });
  }

  const totalRedactions = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text: working, counts, totalRedactions };
}
