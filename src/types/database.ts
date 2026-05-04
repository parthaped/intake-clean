/**
 * Hand-maintained database types that mirror `supabase/migrations/0001_schema.sql`.
 * Run `supabase gen types typescript --local > src/types/database.ts` to refresh
 * once a hosted/local DB is available.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlanTier = "starter" | "solo" | "firm";
export type SubscriptionStatusT =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "inactive";
export type ProfileRole = "admin" | "paralegal" | "attorney";
export type ContactPref = "email" | "sms" | "both";
export type MatterTypeT =
  | "immigration"
  | "family_law"
  | "personal_injury"
  | "probate_estate"
  | "real_estate"
  | "other";
export type MatterStatus =
  | "active"
  | "waiting_on_client"
  | "in_review"
  | "ready_to_export"
  | "completed"
  | "archived";
export type RequestStatus =
  | "draft"
  | "sent"
  | "partially_complete"
  | "submitted"
  | "closed"
  | "expired";
export type RequestItemStatus = "missing" | "uploaded" | "needs_reupload" | "accepted" | "waived";
export type UploadedFileStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "needs_reupload"
  | "accepted"
  | "rejected"
  | "exported";
export type UploaderType = "client" | "staff";
export type RecommendationT = "accept" | "review" | "request_reupload";
export type ReviewStatus = "open" | "accepted" | "rejected" | "requested_reupload";
export type MessageChannel = "email" | "sms" | "system";
export type MessageDirection = "outbound" | "inbound";
export type MessageStatus = "queued" | "sent" | "sent_mock" | "failed" | "received";
export type ExportType = "pdf_packet" | "zip_folder" | "missing_docs_report";
export type JobType = "convert" | "ocr_quality" | "classify" | "export";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type ActorType = "staff" | "client" | "system";

type OrganizationsRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatusT;
  storage_limit_mb: number;
  created_at: string;
  updated_at: string;
}
type OrganizationsInsert = {
  name: string;
  slug: string;
  id?: string;
  logo_url?: string | null;
  plan?: PlanTier;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: SubscriptionStatusT;
  storage_limit_mb?: number;
  created_at?: string;
  updated_at?: string;
}

type ProfilesRow = {
  id: string;
  user_id: string;
  organization_id: string;
  full_name: string;
  role: ProfileRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
type ProfilesInsert = {
  user_id: string;
  organization_id: string;
  full_name: string;
  id?: string;
  role?: ProfileRole;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

type ClientsRow = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: ContactPref;
  created_at: string;
  updated_at: string;
}
type ClientsInsert = {
  organization_id: string;
  full_name: string;
  id?: string;
  email?: string | null;
  phone?: string | null;
  preferred_contact?: ContactPref;
  created_at?: string;
  updated_at?: string;
}

type MattersRow = {
  id: string;
  organization_id: string;
  client_id: string;
  matter_name: string;
  matter_type: MatterTypeT;
  internal_reference: string | null;
  status: MatterStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
type MattersInsert = {
  organization_id: string;
  client_id: string;
  matter_name: string;
  id?: string;
  matter_type?: MatterTypeT;
  internal_reference?: string | null;
  status?: MatterStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

type ChecklistTemplatesRow = {
  id: string;
  organization_id: string | null;
  name: string;
  matter_type: MatterTypeT;
  description: string | null;
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
type ChecklistTemplatesInsert = {
  name: string;
  matter_type: MatterTypeT;
  id?: string;
  organization_id?: string | null;
  description?: string | null;
  is_global?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

type ChecklistTemplateItemsRow = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  required: boolean;
  accepted_file_types: string[];
  sort_order: number;
}
type ChecklistTemplateItemsInsert = {
  template_id: string;
  title: string;
  id?: string;
  description?: string | null;
  required?: boolean;
  accepted_file_types?: string[];
  sort_order?: number;
}

type DocumentRequestsRow = {
  id: string;
  organization_id: string;
  matter_id: string;
  client_id: string;
  title: string;
  message_to_client: string | null;
  token: string;
  status: RequestStatus;
  expires_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
type DocumentRequestsInsert = {
  organization_id: string;
  matter_id: string;
  client_id: string;
  title: string;
  token: string;
  id?: string;
  message_to_client?: string | null;
  status?: RequestStatus;
  expires_at?: string | null;
  sent_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

type DocumentRequestItemsRow = {
  id: string;
  request_id: string;
  title: string;
  description: string | null;
  required: boolean;
  status: RequestItemStatus;
  sort_order: number;
}
type DocumentRequestItemsInsert = {
  request_id: string;
  title: string;
  id?: string;
  description?: string | null;
  required?: boolean;
  status?: RequestItemStatus;
  sort_order?: number;
}

type UploadedFilesRow = {
  id: string;
  organization_id: string;
  matter_id: string;
  request_id: string | null;
  request_item_id: string | null;
  client_id: string;
  original_file_name: string;
  original_mime_type: string;
  original_storage_path: string;
  processed_storage_path: string | null;
  thumbnail_storage_path: string | null;
  file_size_bytes: number;
  page_count: number | null;
  detected_document_type: string | null;
  status: UploadedFileStatus;
  uploaded_by_type: UploaderType;
  packet_order: number | null;
  created_at: string;
  updated_at: string;
}
type UploadedFilesInsert = {
  organization_id: string;
  matter_id: string;
  client_id: string;
  original_file_name: string;
  original_mime_type: string;
  original_storage_path: string;
  file_size_bytes: number;
  uploaded_by_type: UploaderType;
  id?: string;
  request_id?: string | null;
  request_item_id?: string | null;
  processed_storage_path?: string | null;
  thumbnail_storage_path?: string | null;
  page_count?: number | null;
  detected_document_type?: string | null;
  status?: UploadedFileStatus;
  packet_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

type QualityChecksRow = {
  id: string;
  uploaded_file_id: string;
  blur_score: number | null;
  glare_detected: boolean;
  low_contrast_detected: boolean;
  cut_off_edges_detected: boolean;
  rotated_detected: boolean;
  screenshot_detected: boolean;
  handwriting_detected: boolean | null;
  text_extraction_confidence: number | null;
  issue_summary: string | null;
  recommendation: RecommendationT;
  raw_ai_json: Json;
  created_at: string;
}
type QualityChecksInsert = {
  uploaded_file_id: string;
  id?: string;
  blur_score?: number | null;
  glare_detected?: boolean;
  low_contrast_detected?: boolean;
  cut_off_edges_detected?: boolean;
  rotated_detected?: boolean;
  screenshot_detected?: boolean;
  handwriting_detected?: boolean | null;
  text_extraction_confidence?: number | null;
  issue_summary?: string | null;
  recommendation?: RecommendationT;
  raw_ai_json?: Json;
  created_at?: string;
}

type ReviewTasksRow = {
  id: string;
  organization_id: string;
  matter_id: string;
  uploaded_file_id: string;
  assigned_to: string | null;
  status: ReviewStatus;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
}
type ReviewTasksInsert = {
  organization_id: string;
  matter_id: string;
  uploaded_file_id: string;
  id?: string;
  assigned_to?: string | null;
  status?: ReviewStatus;
  reviewer_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

type ClientMessagesRow = {
  id: string;
  organization_id: string;
  matter_id: string;
  client_id: string;
  request_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  subject: string | null;
  body: string;
  status: MessageStatus;
  provider_message_id: string | null;
  created_at: string;
}
type ClientMessagesInsert = {
  organization_id: string;
  matter_id: string;
  client_id: string;
  channel: MessageChannel;
  body: string;
  id?: string;
  request_id?: string | null;
  direction?: MessageDirection;
  subject?: string | null;
  status?: MessageStatus;
  provider_message_id?: string | null;
  created_at?: string;
}

type ExportsRow = {
  id: string;
  organization_id: string;
  matter_id: string;
  created_by: string | null;
  export_type: ExportType;
  storage_path: string;
  summary: string | null;
  created_at: string;
}
type ExportsInsert = {
  organization_id: string;
  matter_id: string;
  export_type: ExportType;
  storage_path: string;
  id?: string;
  created_by?: string | null;
  summary?: string | null;
  created_at?: string;
}

type ProcessingJobsRow = {
  id: string;
  organization_id: string;
  uploaded_file_id: string;
  job_type: JobType;
  status: JobStatus;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}
type ProcessingJobsInsert = {
  organization_id: string;
  uploaded_file_id: string;
  job_type: JobType;
  id?: string;
  status?: JobStatus;
  error_message?: string | null;
  attempts?: number;
  created_at?: string;
  updated_at?: string;
}

type AuditLogsRow = {
  id: string;
  organization_id: string;
  actor_profile_id: string | null;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}
type AuditLogsInsert = {
  organization_id: string;
  action: string;
  entity_type: string;
  id?: string;
  actor_profile_id?: string | null;
  actor_type?: ActorType;
  entity_id?: string | null;
  metadata?: Json;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      organizations: { Row: OrganizationsRow; Insert: OrganizationsInsert; Update: Partial<OrganizationsRow>; Relationships: [] };
      profiles: { Row: ProfilesRow; Insert: ProfilesInsert; Update: Partial<ProfilesRow>; Relationships: [] };
      clients: { Row: ClientsRow; Insert: ClientsInsert; Update: Partial<ClientsRow>; Relationships: [] };
      matters: { Row: MattersRow; Insert: MattersInsert; Update: Partial<MattersRow>; Relationships: [] };
      checklist_templates: { Row: ChecklistTemplatesRow; Insert: ChecklistTemplatesInsert; Update: Partial<ChecklistTemplatesRow>; Relationships: [] };
      checklist_template_items: { Row: ChecklistTemplateItemsRow; Insert: ChecklistTemplateItemsInsert; Update: Partial<ChecklistTemplateItemsRow>; Relationships: [] };
      document_requests: { Row: DocumentRequestsRow; Insert: DocumentRequestsInsert; Update: Partial<DocumentRequestsRow>; Relationships: [] };
      document_request_items: { Row: DocumentRequestItemsRow; Insert: DocumentRequestItemsInsert; Update: Partial<DocumentRequestItemsRow>; Relationships: [] };
      uploaded_files: { Row: UploadedFilesRow; Insert: UploadedFilesInsert; Update: Partial<UploadedFilesRow>; Relationships: [] };
      quality_checks: { Row: QualityChecksRow; Insert: QualityChecksInsert; Update: Partial<QualityChecksRow>; Relationships: [] };
      review_tasks: { Row: ReviewTasksRow; Insert: ReviewTasksInsert; Update: Partial<ReviewTasksRow>; Relationships: [] };
      client_messages: { Row: ClientMessagesRow; Insert: ClientMessagesInsert; Update: Partial<ClientMessagesRow>; Relationships: [] };
      exports: { Row: ExportsRow; Insert: ExportsInsert; Update: Partial<ExportsRow>; Relationships: [] };
      processing_jobs: { Row: ProcessingJobsRow; Insert: ProcessingJobsInsert; Update: Partial<ProcessingJobsRow>; Relationships: [] };
      audit_logs: { Row: AuditLogsRow; Insert: AuditLogsInsert; Update: Partial<AuditLogsRow>; Relationships: [] };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: {
      plan_tier: PlanTier;
      subscription_status_t: SubscriptionStatusT;
      profile_role: ProfileRole;
      contact_pref: ContactPref;
      matter_type_t: MatterTypeT;
      matter_status: MatterStatus;
      request_status: RequestStatus;
      request_item_status: RequestItemStatus;
      uploaded_file_status: UploadedFileStatus;
      uploader_type: UploaderType;
      recommendation_t: RecommendationT;
      review_status: ReviewStatus;
      message_channel: MessageChannel;
      message_direction: MessageDirection;
      message_status: MessageStatus;
      export_type: ExportType;
      job_type: JobType;
      job_status: JobStatus;
      actor_type: ActorType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
