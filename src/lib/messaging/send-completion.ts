import "server-only";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/messaging/email";
import { sendSms } from "@/lib/messaging/sms";
import { renderCompletion } from "@/lib/messaging/templates";
import { getServiceSupabase } from "@/lib/supabase/service";

interface SendCompletionArgs {
  matterId: string;
  organizationId: string;
  actorProfileId?: string | null;
}

interface MatterRow {
  id: string;
  matter_name: string;
  client_id: string;
  clients: {
    full_name: string;
    email: string | null;
    phone: string | null;
    preferred_contact: "email" | "sms" | "both";
  } | null;
  organizations: { name: string } | null;
}

export async function sendCompletionMessage(args: SendCompletionArgs) {
  const service = getServiceSupabase();

  const { data } = await service
    .from("matters")
    .select(
      "id, matter_name, client_id, clients(full_name, email, phone, preferred_contact), organizations(name)",
    )
    .eq("id", args.matterId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();
  const matter = data as MatterRow | null;
  if (!matter || !matter.clients) throw new Error("Matter not found");

  const message = renderCompletion({
    firmName: matter.organizations?.name ?? "Your law firm",
    clientName: matter.clients.full_name,
    matterName: matter.matter_name,
    uploadLink: `${env.appUrl}`,
  });

  const client = matter.clients;
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
      matter_id: matter.id,
      client_id: matter.client_id,
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
      matter_id: matter.id,
      client_id: matter.client_id,
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
    action: "matter.completion_message_sent",
    entityType: "matter",
    entityId: matter.id,
  });
}
