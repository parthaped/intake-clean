/**
 * Seed script to populate a fresh local Supabase project with realistic demo
 * data. Run with `npm run seed` after `supabase db reset` (or after the
 * migrations are applied to a hosted project). Requires:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
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

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedEmail = process.env.SEED_USER_EMAIL ?? "demo@intakeclean.test";
const seedPassword = process.env.SEED_USER_PASSWORD ?? "intakecleanDEMO!42";

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to seed.");
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
