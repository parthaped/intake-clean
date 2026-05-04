import "server-only";

import { env, integrations } from "@/lib/env";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/constants";

interface ClassifyArgs {
  fileName: string;
  ocrText: string | null;
  mime: string;
  matterType: string;
  itemTitle?: string | null;
}

const KEYWORD_MAP: Array<{ type: DocumentType; keywords: string[] }> = [
  { type: "Passport", keywords: ["passport", "passaport"] },
  { type: "Government ID", keywords: ["driver license", "drivers license", "state id", "identification card"] },
  { type: "Birth Certificate", keywords: ["birth certificate", "certificate of birth"] },
  { type: "Marriage Certificate", keywords: ["marriage certificate", "marriage license"] },
  { type: "Divorce Decree", keywords: ["decree of dissolution", "divorce decree"] },
  { type: "Bank Statement", keywords: ["bank statement", "checking account", "savings account", "ending balance"] },
  { type: "Pay Stub", keywords: ["pay stub", "earnings statement", "gross pay", "net pay"] },
  { type: "Tax Return", keywords: ["form 1040", "tax return", "schedule c", "adjusted gross income"] },
  { type: "W-2 / 1099", keywords: ["w-2", "form w-2", "1099", "1099-misc", "1099-nec"] },
  { type: "Medical Record", keywords: ["medical record", "treatment notes", "diagnosis", "patient name"] },
  { type: "Police Report", keywords: ["police report", "incident report", "officer", "case number"] },
  { type: "Court Order", keywords: ["court order", "order of the court", "ordered, adjudged"] },
  { type: "Lease / Property Document", keywords: ["lease agreement", "rental agreement", "deed of trust", "warranty deed"] },
  { type: "Insurance Document", keywords: ["insurance policy", "declaration page", "policy number", "coverage"] },
  { type: "Text Message Evidence", keywords: ["imessage", "text message", "sms"] },
  { type: "App Screenshot Evidence", keywords: ["screenshot", "messenger", "whatsapp"] },
  { type: "Photo Evidence", keywords: ["photo of", "image of injury"] },
];

export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
  reason: string | null;
  source: "filename" | "ocr" | "openai" | "fallback";
}

export async function classifyDocument(args: ClassifyArgs): Promise<ClassificationResult> {
  const filename = args.fileName.toLowerCase();
  const ocr = (args.ocrText ?? "").toLowerCase();

  for (const { type, keywords } of KEYWORD_MAP) {
    if (keywords.some((k) => ocr.includes(k))) {
      return { type, confidence: 0.85, reason: null, source: "ocr" };
    }
  }
  for (const { type, keywords } of KEYWORD_MAP) {
    if (keywords.some((k) => filename.includes(k.replace(/\s+/g, "")) || filename.includes(k))) {
      return { type, confidence: 0.6, reason: null, source: "filename" };
    }
  }

  if (args.itemTitle) {
    const itemTitleLower = args.itemTitle.toLowerCase();
    const match = DOCUMENT_TYPES.find((t) => itemTitleLower.includes(t.toLowerCase()));
    if (match) {
      return { type: match, confidence: 0.55, reason: null, source: "fallback" };
    }
  }

  if (integrations.hasOpenAi) {
    const aiGuess = await classifyWithOpenAi(args);
    if (aiGuess) return aiGuess;
  }

  return { type: "Other / Unknown", confidence: 0.2, reason: null, source: "fallback" };
}

async function classifyWithOpenAi(args: ClassifyArgs): Promise<ClassificationResult | null> {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: env.openAiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You categorize documents that legal staff will review. Output JSON only with keys 'type' and 'reason'. Choose the type from this exact list: " +
            DOCUMENT_TYPES.join(" | ") +
            ". Do not produce any legal opinion. The reason should be 1 short sentence in plain English explaining why you chose that type, written for a non-lawyer.",
        },
        {
          role: "user",
          content: `Filename: ${args.fileName}\nMatter type: ${args.matterType}\nChecklist item: ${
            args.itemTitle ?? "n/a"
          }\nOCR (first 1500 chars): ${args.ocrText?.slice(0, 1500) ?? ""}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { type?: string; reason?: string };
    const match = DOCUMENT_TYPES.find((t) => t === parsed.type);
    if (!match) return null;
    return { type: match, confidence: 0.7, reason: parsed.reason ?? null, source: "openai" };
  } catch (error) {
    console.error("[classify] OpenAI fallback failed", error);
    return null;
  }
}
