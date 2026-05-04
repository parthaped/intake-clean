import "server-only";

export interface TemplateContext {
  firmName: string;
  clientName: string;
  matterName: string;
  uploadLink: string;
  itemName?: string;
  reason?: string;
}

export interface RenderedMessage {
  subject: string;
  emailBody: string;
  smsBody: string;
}

function fill(template: string, ctx: TemplateContext): string {
  return template
    .replaceAll("{firmName}", ctx.firmName)
    .replaceAll("{clientName}", ctx.clientName)
    .replaceAll("{matterName}", ctx.matterName)
    .replaceAll("{uploadLink}", ctx.uploadLink)
    .replaceAll("{itemName}", ctx.itemName ?? "the requested document")
    .replaceAll("{reason}", ctx.reason ?? "the document needs to be retaken");
}

const INITIAL_SUBJECT = "{firmName} needs documents for {matterName}";
const INITIAL_EMAIL = `Hi {clientName},

{firmName} is preparing your matter ({matterName}) and needs a few documents from you.

You can upload them securely from your phone or computer using this private link:
{uploadLink}

The page lists each item we need with simple guidance ("hold the camera flat, capture all four corners, avoid glare"). You can take photos or upload existing PDFs/images.

If you have any questions, just reply to this email.

Thank you,
{firmName}`;
const INITIAL_SMS = `{firmName}: please upload documents for {matterName} here {uploadLink}`;

const REMINDER_SUBJECT = "Friendly reminder: documents needed for {matterName}";
const REMINDER_EMAIL = `Hi {clientName},

Just a quick reminder that {firmName} is still waiting on a few documents for {matterName}. You can upload them here whenever you have a couple of minutes:

{uploadLink}

Thanks again,
{firmName}`;
const REMINDER_SMS = `{firmName} reminder: please upload documents for {matterName}: {uploadLink}`;

const REUPLOAD_SUBJECT = "Please retake one document for {matterName}";
const REUPLOAD_EMAIL = `Hi {clientName},

Thank you for sending in your documents. We need a clearer copy of one item:

Item: {itemName}
Reason: {reason}

You can re-upload it using the same link as before:
{uploadLink}

Tips: place the document on a flat surface, capture all four corners, and avoid glare or shadows.

Thanks,
{firmName}`;
const REUPLOAD_SMS = `{firmName}: please retake "{itemName}" — {reason}. Upload here: {uploadLink}`;

const COMPLETION_SUBJECT = "Thank you — all documents received for {matterName}";
const COMPLETION_EMAIL = `Hi {clientName},

We have everything we need for {matterName}. Thank you for sending your documents in.

We'll reach out if anything else comes up.

Best,
{firmName}`;
const COMPLETION_SMS = `{firmName}: thanks {clientName}, we received everything for {matterName}.`;

export function renderInitial(ctx: TemplateContext): RenderedMessage {
  return {
    subject: fill(INITIAL_SUBJECT, ctx),
    emailBody: fill(INITIAL_EMAIL, ctx),
    smsBody: fill(INITIAL_SMS, ctx),
  };
}

export function renderReminder(ctx: TemplateContext): RenderedMessage {
  return {
    subject: fill(REMINDER_SUBJECT, ctx),
    emailBody: fill(REMINDER_EMAIL, ctx),
    smsBody: fill(REMINDER_SMS, ctx),
  };
}

export function renderReupload(ctx: TemplateContext): RenderedMessage {
  return {
    subject: fill(REUPLOAD_SUBJECT, ctx),
    emailBody: fill(REUPLOAD_EMAIL, ctx),
    smsBody: fill(REUPLOAD_SMS, ctx),
  };
}

export function renderCompletion(ctx: TemplateContext): RenderedMessage {
  return {
    subject: fill(COMPLETION_SUBJECT, ctx),
    emailBody: fill(COMPLETION_EMAIL, ctx),
    smsBody: fill(COMPLETION_SMS, ctx),
  };
}
