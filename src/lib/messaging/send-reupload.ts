import "server-only";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/messaging/email";
import { combinedStatus, type SendDispatchResult } from "@/lib/messaging/send-request";
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
  organizations: { name: string; logo_url: string | null } | null;
}

export async function sendReuploadMessage(args: SendReuploadArgs): Promise<SendDispatchResult | null> {
  const service = getServiceSupabase();

  const { data: requestData } = await service
    .from("document_requests")
    .select(
      "id, matter_id, client_id, title, token, matters(matter_name), clients(full_name, email, phone, preferred_contact), organizations(name, logo_url)",
    )
    .eq("id", args.requestId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();
  const request = requestData as ReuploadRequestRow | null;
  if (!request || !request.clients) return null;

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
    firmLogoUrl: request.organizations?.logo_url ?? null,
  });

  const client = request.clients;
  const wantsEmail = client.preferred_contact === "email" || client.preferred_contact === "both";
  const wantsSms = client.preferred_contact === "sms" || client.preferred_contact === "both";

  let emailResult: Awaited<ReturnType<typeof sendEmail>> | undefined;
  let smsResult: Awaited<ReturnType<typeof sendSms>> | undefined;

  if (wantsEmail && client.email) {
    emailResult = await sendEmail({
      to: client.email,
      subject: message.subject,
      text: message.emailBody,
      html: message.emailHtml,
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
      status: emailResult.status,
      provider_message_id: emailResult.providerMessageId ?? null,
      error_message: emailResult.error ?? null,
    });
  }

  if (wantsSms && client.phone) {
    smsResult = await sendSms({ to: client.phone, body: message.smsBody });
    await service.from("client_messages").insert({
      organization_id: args.organizationId,
      matter_id: request.matter_id,
      client_id: request.client_id,
      request_id: request.id,
      channel: "sms",
      direction: "outbound",
      subject: null,
      body: message.smsBody,
      status: smsResult.status,
      provider_message_id: smsResult.providerMessageId ?? null,
      error_message: smsResult.error ?? null,
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

  return {
    status: combinedStatus(emailResult?.status, smsResult?.status),
    emailError: emailResult?.error ?? null,
    smsError: smsResult?.error ?? null,
  };
}
