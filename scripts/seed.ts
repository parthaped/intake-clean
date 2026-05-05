/**
 * Seed script to populate a fresh local Supabase project with realistic demo
 * data. Run with `npm run seed` after `supabase db reset` (or after the
 * migrations are applied to a hosted project). Requires:
 *   - One of: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 *     NEXT_PUBLIC_STORAGE_SUPABASE_URL, STORAGE_SUPABASE_URL
 *   - One of: SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *     STORAGE_SUPABASE_SECRET_KEY, STORAGE_SUPABASE_SERVICE_ROLE_KEY
 *   - SEED_USER_EMAIL (the auth user that should own the demo org)
 *   - SEED_USER_PASSWORD
 */

import { randomBytes, randomUUID } from "node:crypto";

// Tiny .env loader so we don't take a dotenv dependency for one script.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL ??
  process.env.STORAGE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.STORAGE_SUPABASE_SECRET_KEY ??
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
const seedEmail = process.env.SEED_USER_EMAIL ?? "demo@intakeclean.test";
const seedPassword = process.env.SEED_USER_PASSWORD ?? "intakecleanDEMO!42";

if (!url || !serviceKey) {
  console.error(
    "Set a Supabase URL (NEXT_PUBLIC_SUPABASE_URL or the Vercel Marketplace NEXT_PUBLIC_STORAGE_SUPABASE_URL) and a secret key (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY or the STORAGE_ prefixed equivalents) before running the seed.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("→ Ensuring demo auth user exists…");
  const adminApi = supabase.auth.admin;
  let userId: string;
  const list = await adminApi.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  const existing = list.data.users.find((u) => u.email === seedEmail);
  if (existing) {
    userId = existing.id;
  } else {
    const created = await adminApi.createUser({
      email: seedEmail,
      password: seedPassword,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user!.id;
  }
  console.log(`   user_id=${userId}`);

  console.log("→ Creating Garcia Immigration Law organization…");
  const orgId = randomUUID();
  const orgInsert = await supabase
    .from("organizations")
    .upsert(
      {
        id: orgId,
        name: "Garcia Immigration Law",
        slug: `garcia-immigration-${randomBytes(3).toString("hex")}`,
        plan: "solo",
        subscription_status: "active",
        storage_limit_mb: 25600,
        ai_provider: "mock",
        ai_settings: {
          ocr_engine: "tesseract",
          use_hf_classification: false,
          use_hf_explanations: false,
        },
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (orgInsert.error) throw orgInsert.error;

  console.log("→ Linking profile…");
  const profileInsert = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        organization_id: orgInsert.data.id,
        full_name: "Maria Garcia",
        role: "admin",
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (profileInsert.error) throw profileInsert.error;
  const profileId = profileInsert.data.id;

  console.log("→ Creating client…");
  const clientInsert = await supabase
    .from("clients")
    .insert({
      organization_id: orgId,
      full_name: "Luis Hernandez",
      email: "luis@example.com",
      phone: "+15551230000",
      preferred_contact: "email",
    })
    .select("id")
    .single();
  if (clientInsert.error) throw clientInsert.error;

  console.log("→ Creating immigration matter…");
  const matterInsert = await supabase
    .from("matters")
    .insert({
      organization_id: orgId,
      client_id: clientInsert.data.id,
      matter_name: "Hernandez I-130 Petition",
      matter_type: "immigration",
      internal_reference: "GIL-2026-0042",
      status: "waiting_on_client",
      created_by: profileId,
    })
    .select("id")
    .single();
  if (matterInsert.error) throw matterInsert.error;
  const matterId = matterInsert.data.id;

  console.log("→ Creating sent document request…");
  const token = randomBytes(32).toString("base64url");
  const requestInsert = await supabase
    .from("document_requests")
    .insert({
      organization_id: orgId,
      matter_id: matterId,
      client_id: clientInsert.data.id,
      title: "Initial document checklist",
      message_to_client: "Please upload the documents below at your convenience.",
      token,
      status: "sent",
      sent_at: new Date().toISOString(),
      created_by: profileId,
    })
    .select("id")
    .single();
  if (requestInsert.error) throw requestInsert.error;
  const requestId = requestInsert.data.id;

  const items = [
    { title: "Government-issued photo ID", required: true, status: "accepted" },
    { title: "Marriage certificate", required: true, status: "needs_reupload" },
    { title: "Bank statements (last 3 months)", required: true, status: "uploaded" },
    { title: "Birth certificate (translated)", required: true, status: "missing" },
  ];
  const itemRecords = items.map((item, idx) => ({
    request_id: requestId,
    title: item.title,
    required: item.required,
    sort_order: idx,
    status: item.status,
  }));
  const itemsInsert = await supabase
    .from("document_request_items")
    .insert(itemRecords)
    .select("id, title");
  if (itemsInsert.error) throw itemsInsert.error;

  console.log("→ Seeding demo uploaded files + quality checks…");
  const uploadedItems = itemsInsert.data ?? [];
  const findItem = (substr: string) =>
    uploadedItems.find((i) => i.title.toLowerCase().includes(substr.toLowerCase()))?.id ?? null;

  const happyItemId = findItem("photo id");
  const reuploadItemId = findItem("marriage");

  const happyFileId = randomUUID();
  const reuploadFileId = randomUUID();

  const happyStoragePath = `${orgId}/${matterId}/original/demo-id-card.jpg`;
  const reuploadStoragePath = `${orgId}/${matterId}/original/demo-blurry-marriage.jpg`;

  const filesInsert = await supabase.from("uploaded_files").insert([
    {
      id: happyFileId,
      organization_id: orgId,
      matter_id: matterId,
      client_id: clientInsert.data.id,
      request_id: requestId,
      request_item_id: happyItemId,
      original_file_name: "drivers-license-front.jpg",
      original_mime_type: "image/jpeg",
      original_storage_path: happyStoragePath,
      file_size_bytes: 412_000,
      uploaded_by_type: "client",
      detected_document_type: "Government ID",
      classification_source: "rules",
      classification_confidence: 0.86,
      processing_provider: "mock",
      ocr_engine: "mock",
      ocr_text:
        "STATE OF CALIFORNIA\nDRIVER LICENSE\nDL X1234567\nLN HERNANDEZ\nFN LUIS\n4567 OAK STREET\nLOS ANGELES CA 90034\nDOB 05/12/1988",
      ocr_confidence: 0.91,
      page_count: 1,
      status: "needs_review",
    },
    {
      id: reuploadFileId,
      organization_id: orgId,
      matter_id: matterId,
      client_id: clientInsert.data.id,
      request_id: requestId,
      request_item_id: reuploadItemId,
      original_file_name: "marriage-certificate-blurry.jpg",
      original_mime_type: "image/jpeg",
      original_storage_path: reuploadStoragePath,
      file_size_bytes: 1_204_000,
      uploaded_by_type: "client",
      detected_document_type: "Marriage Certificate",
      classification_source: "fallback",
      classification_confidence: 0.45,
      processing_provider: "mock",
      ocr_engine: "mock",
      ocr_text: "marriage certificate ... [text unclear]",
      ocr_confidence: 0.32,
      page_count: 1,
      status: "needs_reupload",
    },
  ]);
  if (filesInsert.error) throw filesInsert.error;

  await supabase.from("quality_checks").insert([
    {
      uploaded_file_id: happyFileId,
      blur_score: 0.18,
      glare_detected: false,
      low_contrast_detected: false,
      cut_off_edges_detected: false,
      rotated_detected: false,
      screenshot_detected: false,
      handwriting_detected: false,
      text_extraction_confidence: 0.91,
      issue_summary: "Looks usable. Awaiting staff review.",
      recommendation: "review",
      ocr_engine: "mock",
      raw_ai_json: {
        mock: true,
        classification: { type: "Government ID", source: "rules", confidence: 0.86, reason: "Matched DRIVER LICENSE keywords." },
      },
      local_flags: { firedFlags: [], blurScore: 0.18, brightness: 0.62, contrast: 0.21 },
      raw_ocr_json: { mock: true, lang: "eng", confidence: 0.91 },
    },
    {
      uploaded_file_id: reuploadFileId,
      blur_score: 0.78,
      glare_detected: false,
      low_contrast_detected: true,
      cut_off_edges_detected: false,
      rotated_detected: false,
      screenshot_detected: false,
      handwriting_detected: false,
      text_extraction_confidence: 0.32,
      issue_summary:
        "This photo is too blurry to review. The image is too dark or has low contrast. Very little text could be read from this upload.",
      recommendation: "request_reupload",
      ocr_engine: "mock",
      raw_ai_json: {
        mock: true,
        classification: { type: "Marriage Certificate", source: "fallback", confidence: 0.45, reason: "Inferred from checklist item." },
      },
      local_flags: {
        firedFlags: ["blur_detected", "low_contrast_detected", "ocr_text_too_short"],
        blurScore: 0.78,
        brightness: 0.14,
        contrast: 0.09,
      },
      raw_ocr_json: { mock: true, lang: "eng", confidence: 0.32 },
    },
  ]);

  await supabase.from("review_tasks").insert([
    {
      organization_id: orgId,
      matter_id: matterId,
      uploaded_file_id: happyFileId,
      status: "open",
    },
    {
      organization_id: orgId,
      matter_id: matterId,
      uploaded_file_id: reuploadFileId,
      status: "open",
    },
  ]);

  console.log("→ Recording demo audit logs…");
  await supabase.from("audit_logs").insert([
    {
      organization_id: orgId,
      actor_profile_id: profileId,
      actor_type: "staff",
      action: "matter.created",
      entity_type: "matter",
      entity_id: matterId,
    },
    {
      organization_id: orgId,
      actor_profile_id: profileId,
      actor_type: "staff",
      action: "request.sent",
      entity_type: "document_request",
      entity_id: requestId,
    },
  ]);

  console.log("\nDone. Sign in with:");
  console.log(`  email: ${seedEmail}`);
  console.log(`  password: ${seedPassword}`);
  console.log(`Upload link: /upload/${token}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
