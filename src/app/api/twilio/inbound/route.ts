import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Placeholder Twilio inbound webhook. Twilio posts URL-encoded form data with
 * `From`, `Body`, `MessageSid`, etc. We try to match the sender to a known
 * client phone number and append the inbound SMS to that thread.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const from = (formData.get("From") ?? "").toString().trim();
  const body = (formData.get("Body") ?? "").toString().trim();
  const messageSid = (formData.get("MessageSid") ?? "").toString().trim() || null;
  if (!from || !body) {
    return new NextResponse("Missing From/Body", { status: 400 });
  }

  const service = getServiceSupabase();
  const { data: client } = await service
    .from("clients")
    .select("id, organization_id")
    .eq("phone", from)
    .maybeSingle();

  if (!client) {
    return new NextResponse("OK", { status: 200 });
  }

  const { data: matter } = await service
    .from("matters")
    .select("id")
    .eq("client_id", client.id)
    .eq("organization_id", client.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!matter) {
    return new NextResponse("OK", { status: 200 });
  }

  await service.from("client_messages").insert({
    organization_id: client.organization_id,
    matter_id: matter.id,
    client_id: client.id,
    channel: "sms",
    direction: "inbound",
    subject: null,
    body,
    status: "received",
    provider_message_id: messageSid,
  });

  return new NextResponse("OK", { status: 200 });
}
