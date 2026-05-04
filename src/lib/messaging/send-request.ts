import "server-only";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/messaging/email";
import { sendSms } from "@/lib/messaging/sms";
import { renderInitial, renderReminder } from "@/lib/messaging/templates";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { MessageStatus } from "@/types/database";

interface SendRequestArgs {
  requestId: string;
  organizationId: string;
  actorProfileId?: string | null;
  kind: "initial" | "reminder";
}

interface RequestRow {
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

function combinedStatus(...statuses: ("sent" | "sent_mock" | "failed" | undefined)[]): MessageStatus {
  const present = statuses.filter((s): s is "sent" | "sent_mock" | "failed" => Boolean(s));
  if (present.length === 0) return "failed";
  if (present.includes("sent")) return "sent";
  if (present.every((s) => s === "sent_mock")) return "sent_mock";
  if (present.includes("failed") && !present.includes("sent")) return "failed";
  return "sent_mock";
}

export async function sendRequestEmailAndSms(args: SendRequestArgs) {
  const service = getServiceSupabase();

  const { data, error } = await service
    .from("document_requests")
    .select(
      "id, matter_id, client_id, title, token, matters(matter_name), clients(full_name, email, phone, preferred_contact), organizations(name)",
    )
    .eq("id", args.requestId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const request = data as RequestRow | null;
  if (!request) throw new Error("Request not found");

  const client = request.clients;
  const organization = request.organizations;
  const matter = request.matters;
  if (!client) throw new Error("Client missing");

  const uploadLink = `${env.appUrl}/upload/${request.token}`;
  const ctx = {
    firmName: organization?.name ?? "Your law firm",
    clientName: client.full_name,
    matterName: matter?.matter_name ?? request.title,
    uploadLink,
  };
  const message = args.kind === "initial" ? renderInitial(ctx) : renderReminder(ctx);

  const wantsEmail = client.preferred_contact === "email" || client.preferred_contact === "both";
  const wantsSms = client.preferred_contact === "sms" || client.preferred_contact === "both";

  let emailResult: Awaited<ReturnType<typeof sendEmail>> | undefined;
  let smsResult: Awaited<ReturnType<typeof sendSms>> | undefined;

  if (wantsEmail && client.email) {
    emailResult = await sendEmail({
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
      status: emailResult.status,
      provider_message_id: emailResult.providerMessageId ?? null,
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
    });
  }

  if (!emailResult && !smsResult) {
    await service.from("client_messages").insert({
      organization_id: args.organizationId,
      matter_id: request.matter_id,
      client_id: request.client_id,
      request_id: request.id,
      channel: "system",
      direction: "outbound",
      subject: message.subject,
      body: "Client has no email or phone on file. Add contact details, then resend.",
      status: "failed",
    });
  }

  const finalStatus = combinedStatus(emailResult?.status, smsResult?.status);

  await service
    .from("document_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", args.requestId);

  await recordAudit({
    organizationId: args.organizationId,
    actorProfileId: args.actorProfileId ?? null,
    action: args.kind === "initial" ? "request.sent" : "request.reminder_sent",
    entityType: "document_request",
    entityId: request.id,
    metadata: { status: finalStatus },
  });

  return { status: finalStatus };
}
