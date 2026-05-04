import "server-only";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/messaging/email";
import { sendSms } from "@/lib/messaging/sms";
import { renderReupload } from "@/lib/messaging/templates";
import { getServiceSupabase } from "@/lib/supabase/service";

interface SendReuploadArgs {
  organizationId: string;
  actorProfileId?: string | null;
  requestId: string;
  requestItemId: string;
  reason: string;
}

interface ReuploadRequestRow {
  id: string;
  matter_id: string;
  client_id: string;
  title: string;
  token: string;
  matters: { matter_name: string } | null;
  clients: {
    full_name: string;
    email: string | null;
    phone: string | null;
    preferred_contact: "email" | "sms" | "both";
  } | null;
  organizations: { name: string } | null;
}

export async function sendReuploadMessage(args: SendReuploadArgs) {
  const service = getServiceSupabase();

  const { data: requestData } = await service
    .from("document_requests")
    .select(
      "id, matter_id, client_id, title, token, matters(matter_name), clients(full_name, email, phone, preferred_contact), organizations(name)",
    )
    .eq("id", args.requestId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();
  const request = requestData as ReuploadRequestRow | null;
  if (!request || !request.clients) return;

  const { data: item } = await service
    .from("document_request_items")
    .select("title")
    .eq("id", args.requestItemId)
    .maybeSingle();

  const uploadLink = `${env.appUrl}/upload/${request.token}?item=${args.requestItemId}`;
  const message = renderReupload({
    firmName: request.organizations?.name ?? "Your law firm",
    clientName: request.clients.full_name,
    matterName: request.matters?.matter_name ?? request.title,
    uploadLink,
    itemName: item?.title ?? "the document",
    reason: args.reason,
  });

  const client = request.clients;
  const wantsEmail = client.preferred_contact === "email" || client.preferred_contact === "both";
  const wantsSms = client.preferred_contact === "sms" || client.preferred_contact === "both";

  if (wantsEmail && client.email) {
    const result = await sendEmail({
      to: client.email,
      subject: message.subject,
      text: message.emailBody,
    });
    await service.from("client_messages").insert({
      organization_id: args.organizationId,
      matter_id: request.matter_id,
      client_id: request.client_id,
      request_id: request.id,
      channel: "email",
      direction: "outbound",
      subject: message.subject,
      body: message.emailBody,
      status: result.status,
      provider_message_id: result.providerMessageId ?? null,
    });
  }

  if (wantsSms && client.phone) {
    const result = await sendSms({ to: client.phone, body: message.smsBody });
    await service.from("client_messages").insert({
      organization_id: args.organizationId,
      matter_id: request.matter_id,
      client_id: request.client_id,
      request_id: request.id,
      channel: "sms",
      direction: "outbound",
      subject: null,
      body: message.smsBody,
      status: result.status,
      provider_message_id: result.providerMessageId ?? null,
    });
  }

  await recordAudit({
    organizationId: args.organizationId,
    actorProfileId: args.actorProfileId ?? null,
    action: "request.reupload_message_sent",
    entityType: "document_request_item",
    entityId: args.requestItemId,
    metadata: { reason: args.reason },
  });
}
