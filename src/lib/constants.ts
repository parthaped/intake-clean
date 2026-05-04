import type {
  ExportType,
  JobStatus,
  MatterStatus,
  MatterTypeT,
  RequestItemStatus,
  RequestStatus,
  ReviewStatus,
  UploadedFileStatus,
  PlanTier,
} from "@/types/database";

export const APP_NAME = "IntakeClean";
export const APP_TAGLINE = "Stop cleaning up client screenshots and blurry document photos.";

export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
] as const;

export const ACCEPTED_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp"] as const;

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const DOCUMENT_TYPES = [
  "Government ID",
  "Passport",
  "Birth Certificate",
  "Marriage Certificate",
  "Divorce Decree",
  "Bank Statement",
  "Pay Stub",
  "Tax Return",
  "W-2 / 1099",
  "Medical Record",
  "Police Report",
  "Court Order",
  "Lease / Property Document",
  "Insurance Document",
  "Text Message Evidence",
  "App Screenshot Evidence",
  "Photo Evidence",
  "Other / Unknown",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Used by the ZIP exporter to bucket files into folder groups. */
export const DOCUMENT_TYPE_FOLDERS: Record<string, string> = {
  "Government ID": "01 Government ID",
  Passport: "01 Government ID",
  "Birth Certificate": "01 Government ID",
  "Marriage Certificate": "01 Government ID",
  "Divorce Decree": "01 Government ID",
  "Bank Statement": "02 Financial Records",
  "Pay Stub": "02 Financial Records",
  "Tax Return": "02 Financial Records",
  "W-2 / 1099": "02 Financial Records",
  "Court Order": "03 Court Documents",
  "Police Report": "03 Court Documents",
  "Lease / Property Document": "03 Court Documents",
  "Medical Record": "04 Evidence",
  "Insurance Document": "04 Evidence",
  "Text Message Evidence": "04 Evidence",
  "App Screenshot Evidence": "04 Evidence",
  "Photo Evidence": "04 Evidence",
};

export const MATTER_TYPE_LABEL: Record<MatterTypeT, string> = {
  immigration: "Immigration",
  family_law: "Family law",
  personal_injury: "Personal injury",
  probate_estate: "Probate / estate",
  real_estate: "Real estate",
  other: "Other",
};

export const MATTER_STATUS_LABEL: Record<MatterStatus, string> = {
  active: "Active",
  waiting_on_client: "Waiting on client",
  in_review: "In review",
  ready_to_export: "Ready to export",
  completed: "Completed",
  archived: "Archived",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_complete: "Partially complete",
  submitted: "Submitted",
  closed: "Closed",
  expired: "Expired",
};

export const REQUEST_ITEM_STATUS_LABEL: Record<RequestItemStatus, string> = {
  missing: "Missing",
  uploaded: "Uploaded",
  needs_reupload: "Needs re-upload",
  accepted: "Accepted",
  waived: "Waived",
};

export const FILE_STATUS_LABEL: Record<UploadedFileStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Ready for staff review",
  needs_reupload: "Needs re-upload",
  accepted: "Accepted into packet",
  rejected: "Rejected",
  exported: "Exported",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  rejected: "Rejected",
  requested_reupload: "Requested re-upload",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export const EXPORT_TYPE_LABEL: Record<ExportType, string> = {
  pdf_packet: "Clean PDF packet",
  zip_folder: "Organized ZIP folder",
  missing_docs_report: "Missing documents report",
};

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  monthlyPriceCents: number;
  matterLimit: number;
  storageGb: number;
  storageMb: number;
  features: string[];
  highlight?: boolean;
  envPriceKey: "stripePriceStarter" | "stripePriceSolo" | "stripePriceFirm";
}

export const PLANS: PlanDefinition[] = [
  {
    tier: "starter",
    name: "Starter",
    priceLabel: "$39",
    monthlyPriceCents: 3900,
    matterLimit: 3,
    storageGb: 5,
    storageMb: 5120,
    features: [
      "3 active matters",
      "5 GB document storage",
      "Email upload links",
      "Standard quality checks",
    ],
    envPriceKey: "stripePriceStarter",
  },
  {
    tier: "solo",
    name: "Solo",
    priceLabel: "$79",
    monthlyPriceCents: 7900,
    matterLimit: 15,
    storageGb: 25,
    storageMb: 25600,
    features: [
      "15 active matters",
      "25 GB document storage",
      "Email + SMS upload links",
      "Custom checklist templates",
      "Priority quality processing",
    ],
    highlight: true,
    envPriceKey: "stripePriceSolo",
  },
  {
    tier: "firm",
    name: "Firm",
    priceLabel: "$149",
    monthlyPriceCents: 14900,
    matterLimit: 50,
    storageGb: 100,
    storageMb: 102400,
    features: [
      "50 active matters",
      "100 GB document storage",
      "Multiple staff seats",
      "Advanced audit logs",
      "Priority support",
    ],
    envPriceKey: "stripePriceFirm",
  },
];

export const PLAN_BY_TIER: Record<PlanTier, PlanDefinition> = PLANS.reduce(
  (acc, plan) => {
    acc[plan.tier] = plan;
    return acc;
  },
  {} as Record<PlanTier, PlanDefinition>,
);

export const REUPLOAD_REASONS = [
  "The page is too blurry to read.",
  "Part of the document is cut off. Please retake with all four corners visible.",
  "This looks like a screenshot. Please upload the original PDF if possible.",
  "We need page 2 of this document.",
  "The image is too dark or has too much glare.",
  "This is not the document we asked for.",
  "We need a more recent copy of this document.",
] as const;

export const DISCLAIMER_LINES = [
  "IntakeClean helps organize documents and does not provide legal advice.",
  "All AI classifications and quality checks must be reviewed by firm staff.",
  "Do not rely on IntakeClean to determine legal sufficiency of a filing.",
];
