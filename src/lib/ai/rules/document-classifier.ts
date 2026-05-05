import "server-only";

import { DOCUMENT_TYPES, type DocumentType } from "@/lib/constants";
import type { DocumentClassificationResult } from "@/lib/ai/types";

interface ClassifyArgs {
  fileName: string;
  ocrText: string | null;
  mime: string;
  matterType: string;
  itemTitle?: string | null;
}

interface KeywordRule {
  type: DocumentType;
  /** Multi-keyword AND-groups. Match means *all* keywords in a group are present. */
  groups: string[][];
  /** Confidence boost when matched on OCR text (0..0.3). */
  weight?: number;
}

/**
 * Rules engine. Each rule has one or more keyword groups; an OCR text match on
 * any group counts as a hit. Multi-keyword groups (e.g. ["statement period",
 * "account number"]) require all words to appear, which sharply improves
 * precision for short text fragments.
 */
const RULES: KeywordRule[] = [
  { type: "Passport", groups: [["passport"], ["nationality", "date of birth"]], weight: 0.05 },
  {
    type: "Government ID",
    groups: [["driver license"], ["drivers license"], ["state id"], ["identification card"], ["dl no"]],
  },
  { type: "Birth Certificate", groups: [["birth certificate"], ["certificate of birth"]] },
  { type: "Marriage Certificate", groups: [["marriage certificate"], ["marriage license"], ["united in marriage"]] },
  { type: "Divorce Decree", groups: [["divorce decree"], ["decree of dissolution"]] },
  {
    type: "Bank Statement",
    groups: [
      ["statement period", "account number"],
      ["beginning balance", "ending balance"],
      ["bank statement"],
      ["checking account"],
      ["savings account"],
    ],
    weight: 0.1,
  },
  {
    type: "Pay Stub",
    groups: [["pay stub"], ["earnings statement"], ["gross pay", "net pay"], ["pay period", "ytd"]],
  },
  { type: "Tax Return", groups: [["form 1040"], ["schedule c"], ["adjusted gross income"]] },
  {
    type: "W-2 / 1099",
    groups: [["w-2"], ["form w-2"], ["1099-misc"], ["1099-nec"], ["wages, tips, other compensation"], ["wages", "employer"]],
    weight: 0.05,
  },
  {
    type: "Medical Record",
    groups: [["medical record"], ["treatment notes"], ["diagnosis", "patient name"], ["chief complaint"]],
  },
  {
    type: "Police Report",
    groups: [["police report"], ["incident report"], ["case number", "officer"], ["reporting officer"]],
  },
  { type: "Court Order", groups: [["court order"], ["order of the court"], ["ordered, adjudged"], ["last will and testament"]] },
  {
    type: "Lease / Property Document",
    groups: [["lease agreement"], ["rental agreement"], ["deed of trust"], ["warranty deed"], ["legal description"]],
  },
  {
    type: "Insurance Document",
    groups: [["insurance policy"], ["declaration page"], ["policy number", "coverage"]],
  },
  { type: "Text Message Evidence", groups: [["imessage"], ["text message"]] },
  { type: "App Screenshot Evidence", groups: [["screenshot"], ["messenger"], ["whatsapp"]] },
  { type: "Photo Evidence", groups: [["photo of"], ["image of injury"]] },
];

function matchInText(
  text: string,
  rules: KeywordRule[],
  baseConfidence: number,
  source: "ocr" | "rules",
): { type: DocumentType; confidence: number; source: "ocr" | "rules" } | null {
  for (const rule of rules) {
    for (const group of rule.groups) {
      if (group.every((kw) => text.includes(kw))) {
        const confidence = Math.min(0.95, baseConfidence + (rule.weight ?? 0));
        return { type: rule.type, confidence, source };
      }
    }
  }
  return null;
}

/**
 * Pure rule-based classifier. Looks at OCR text first (highest precision), then
 * the filename, then the request item title as a hint. Returns confidence so
 * callers can decide whether to escalate to a Hugging Face model.
 */
export async function classifyByRules(args: ClassifyArgs): Promise<DocumentClassificationResult> {
  const ocr = (args.ocrText ?? "").toLowerCase();
  const filename = args.fileName.toLowerCase();

  if (ocr.length > 25) {
    const ocrHit = matchInText(ocr, RULES, 0.82, "ocr");
    if (ocrHit) {
      return { ...ocrHit, reason: `Matched keywords in OCR text for ${ocrHit.type}.` };
    }
  }

  const filenameHit = matchInText(filename, RULES, 0.55, "rules");
  if (filenameHit) {
    return { ...filenameHit, reason: `Matched filename keywords for ${filenameHit.type}.` };
  }

  if (args.itemTitle) {
    const itemTitleLower = args.itemTitle.toLowerCase();
    const match = DOCUMENT_TYPES.find((t) => itemTitleLower.includes(t.toLowerCase()));
    if (match) {
      return {
        type: match,
        confidence: 0.5,
        source: "fallback",
        reason: "Inferred from the checklist item the client was asked to upload.",
      };
    }
  }

  return {
    type: "Other / Unknown",
    confidence: 0.2,
    source: "fallback",
    reason: "Rules could not confidently classify this document.",
  };
}
