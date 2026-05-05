# IntakeClean — AI Output Disclaimer

> **What this is.** This is the in-product, customer-facing notice that AI-derived outputs in IntakeClean (document classifications, OCR transcripts, quality flags, AI-generated re-upload messages) are assistive and require human review. Place the **short form** on the upload page, the review queue header, and the per-document detail drawer. Place the **long form** on a dedicated `/legal/ai` page linked from the in-product footer.
>
> **Why it matters.** A clear, prominent AI disclaimer helps Customer's staff (and Customer's malpractice insurer, and the bar) understand that automated outputs are not legal conclusions. It also reduces the likelihood that a court treats automated outputs as Customer's professional work product.

---

## Short form (in-product banner / footer)

> **AI checks are assistive only.** IntakeClean uses automated tools (OCR, rule-based detection, and — where you have enabled it — third-party AI models) to classify, transcribe, and quality-flag documents. **Outputs may be inaccurate, incomplete, or misleading.** Firm staff must review every document and every automated output before relying on it for any client matter. IntakeClean does not provide legal advice.

---

## Long form (dedicated `/legal/ai` page)

### What IntakeClean's AI does

The IntakeClean Service applies a layered pipeline to each document uploaded by Customer or Customer's End-Client:

1. **Deterministic preprocessing** — format conversion, exposure normalization, deskew, orientation detection. No machine-learning model is involved at this layer.
2. **Local OCR** — open-source optical character recognition runs on the application server to produce a text transcript with per-token confidence.
3. **Rule-based classification and quality flagging** — patterns and heuristics derive a document-type label, a quality score, and (where applicable) a reason code such as `page_cut_off` or `glare`.
4. **(Optional) Remote AI escalation** — when Customer has enabled it, low-confidence cases may be escalated to a third-party AI inference provider for re-classification or for generating a plain-language re-upload request to the End-Client.

### What AI cannot do

- AI **cannot** determine whether a document is legally sufficient for a filing, hearing, motion, or transaction.
- AI **cannot** identify the existence or applicability of legal privilege.
- AI **cannot** detect every error, omission, or quality issue in a document.
- AI **cannot** read every document accurately. OCR errors are common with low-light photos, handwriting, dot-matrix print, foreign-language text, water damage, and unusual fonts.
- AI **may "hallucinate"** — that is, produce plausible-looking outputs that are not grounded in the actual document content. AI-generated re-upload messages, in particular, may contain inaccurate descriptions of the underlying document.

### Customer responsibilities

- **Review every document.** A trained human staff member must review each document and each automated output before any reliance.
- **Review AI-generated communications.** Any AI-generated message intended for an End-Client must be reviewed and approved by a human before sending.
- **Apply professional judgment.** Customer's professional judgment — not the AI's output — governs the legal sufficiency, suitability, and use of any document.
- **Confirm consent.** Customer is responsible for any consent or notice required from End-Clients before processing their documents through optional AI integrations.
- **Report errors.** When a serious classification error or hallucination is observed, report it to `[support@CONTACT EMAIL]` so we can investigate.

### Logging and audit

For each document, IntakeClean records: the layer that produced the final classification, the provider invoked at each layer (where applicable), the timing of each stage, and any reason codes emitted. This per-document audit log is available to Customer's administrators in the Service.

### Confidentiality of optional AI providers

Where Customer enables an optional third-party AI inference provider, document content is transmitted to that provider for the duration of the inference request and is subject to that provider's privacy and retention policies as described in our [Subprocessor List](07-subprocessor-list.md). IntakeClean does not use, and contractually requires that its AI subprocessors do not use, Customer Content to train any general-purpose AI model.

### Not legal advice

The IntakeClean Service, including all automated outputs, is **not legal advice** and **not a substitute for the professional judgment** of a licensed attorney. No attorney-client relationship exists between IntakeClean and any End-Client.

### Questions

`[support@CONTACT EMAIL]`
