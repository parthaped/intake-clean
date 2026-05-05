# IntakeClean — Subprocessor List

**Last updated:** `[YYYY-MM-DD]`

This page lists the third-party subprocessors that may process Customer Personal Data on IntakeClean's behalf. We update this page whenever we add, remove, or materially change a subprocessor. Customers receive at least **thirty (30) days' notice** of new subprocessors and may object on reasonable data-protection grounds in accordance with the [Data Processing Addendum](03-data-processing-addendum.md).

---

## Always-on subprocessors

These subprocessors are required to deliver the core Service.

| Subprocessor | Service provided | Categories of data | Region(s) | Privacy / DPA |
| --- | --- | --- | --- | --- |
| **Supabase, Inc.** | Authentication, Postgres database hosting, object storage for uploaded documents, row-level security enforcement | Account credentials (hashed), profile, all Customer Content (uploaded documents, OCR transcripts, classification labels, audit logs) | United States (default region; verify current region in your Supabase project settings) | <https://supabase.com/legal/dpa> |
| **`[HOSTING / CDN PROVIDER e.g., Vercel]`** | Application hosting, edge network, deployment platform | Request metadata, IP, user-agent; transient document content during request handling | Global edge with primary regions in the United States and Europe | `[link to provider's DPA]` |

> If you are hosted on Vercel, list Vercel here (Vercel Inc., DPA at <https://vercel.com/legal/dpa>). If you are self-hosting, list your hosting provider. Do not leave this row generic in production.

## Conditionally enabled subprocessors

These subprocessors are engaged only if the Customer or IntakeClean enables the corresponding feature.

| Subprocessor | When engaged | Categories of data | Region(s) | Privacy / DPA |
| --- | --- | --- | --- | --- |
| **Stripe, Inc.** | When Customer pays for a subscription | Billing contact, tokenized payment method, transaction metadata. **No card numbers** are stored on IntakeClean's systems. | United States (PCI Level 1 service provider) | <https://stripe.com/legal/dpa> |
| **Resend, Inc.** | When Customer uses the email-delivery feature (notifications, document-request emails to End-Clients) | Recipient email address, message subject and body, send/delivery metadata | United States | <https://resend.com/legal/dpa> |
| **Twilio, Inc.** | When Customer uses the SMS feature (re-upload reminders, document-request texts) | Recipient phone number, message body, send/delivery metadata | United States | <https://www.twilio.com/legal/data-protection-addendum> |
| **Hugging Face, Inc.** (Inference Providers) | When Customer enables `AI_PROVIDER=huggingface_provider` for ambiguous-classification escalation or AI-generated re-upload messages | OCR transcripts and (in the vision-model embodiment) normalized images of the relevant document, plus the prompt template | United States; some inference is routed to provider partners — see Hugging Face's documentation | <https://huggingface.co/privacy> · DPA available on request |
| **`[Customer-controlled HF Inference Endpoint]`** | When Customer enables `AI_PROVIDER=huggingface_endpoint` and provides a private endpoint URL | Same as Hugging Face row above | Customer-determined | Customer's own DPA with its endpoint operator |

## Sub-processors NOT used

We do not currently use:
- General-purpose ad-tech / cross-context behavioral advertising networks.
- Customer-data analytics that send Customer Content (or End-Client Content) off-platform.
- Generative-AI providers other than those listed above.

We do not transmit Customer Content to OpenAI, Anthropic, or Google Gemini. If we add such a provider in the future, we will provide thirty (30) days' notice in accordance with the DPA.

## Notification preferences

To be notified by email when this list changes, send your email address to `[privacy@CONTACT EMAIL]` with subject "Subprocessor change notifications." We will add you to the notification list and confirm. You can unsubscribe at any time.
