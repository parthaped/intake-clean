# Invention Disclosure Memorandum — IntakeClean Document AI Pipeline

> **Internal record. Confidential.** This memo is the contemporaneous, signed record of the invention. Keep the signed and dated original; share with patent counsel under privilege only. Do **not** publish, post on the marketing site, or describe in a blog or conference talk before the provisional is filed — public disclosure starts a 12-month grace period under 35 U.S.C. § 102(b)(1) in the U.S. and immediately destroys patentability in most non-U.S. jurisdictions.

---

## 1. Identifying information

| Field | Value |
| --- | --- |
| Working title | Multi-Layer Adaptive Document Intake Pipeline with Cost-Aware AI Escalation |
| Inventor(s) | `[FOUNDER NAME]`, sole inventor |
| Inventor address | `[FOUNDER ADDRESS]` |
| Citizenship | `[FOUNDER CITIZENSHIP]` |
| Assignee (after assignment) | `[LLC NAME]` |
| Date of conception | `[YYYY-MM-DD]` (earliest documented evidence — commit, sketch, journal entry) |
| Date of first reduction to practice | `[YYYY-MM-DD]` (first runnable prototype) |
| First public disclosure (if any) | `[YYYY-MM-DD or "None"]` — see grace-period note above |
| Related prior commits / artifacts | git history at `src/lib/processing/`, `src/lib/ai/`, schema migrations under `supabase/migrations/` |

## 2. Field of the invention

The invention relates to systems and methods for ingesting heterogeneous client-supplied documents (photos of documents, screenshots, scans, PDFs, HEIC images) into a downstream professional-services workflow (e.g., a law firm's case file). It addresses the technical problem of producing usable, properly-classified, legible, normalized documents from low-quality consumer inputs while keeping per-document compute and AI inference cost low enough for sub-$50/month SaaS pricing.

## 3. Problem statement

Small professional-services firms — particularly small law firms and paralegals — lose substantial billable time **cleaning, classifying, and triaging** client-supplied documents. Existing solutions have one or more of the following failure modes:

1. **Cost.** Generic Document AI services (e.g., Google Document AI, AWS Textract, Azure Document Intelligence) charge per-page on every input, including low-quality images that should have been rejected up front. This is prohibitive at the price point small firms will tolerate.
2. **Privacy.** Routing every page through a third-party LLM exposes attorney–client privileged material and end-client PII to processors the firm has not vetted.
3. **One-size-fits-all classification.** General-purpose document classifiers misclassify firm-specific document types (e.g., I-130, Form I-94, Notice to Appear, divorce decree from a specific county), and there is no inexpensive way to give the classifier a per-firm hint.
4. **No quality triage.** Existing pipelines extract whatever they can from any input, producing low-confidence results that the staff still has to re-examine and the client still has to re-send. There is no early "ask the client to retake the photo" loop.

## 4. Summary of the invention (plain language)

The invention is a **layered, cost-aware document-processing pipeline** for client-supplied documents in a professional-services intake context. The pipeline applies progressively more expensive analysis stages, but **only escalates** to the next stage when the prior stage's confidence falls below a configurable threshold. Stage ordering is roughly:

1. **Layer 1 — Deterministic preprocessing.** Format conversion (HEIC → JPEG, PDF rasterization), exposure / contrast normalization, deskew, and orientation detection performed locally with `sharp`, `heic-convert`, and `pdf-lib`. No AI cost.
2. **Layer 2 — Local OCR.** Open-source OCR (e.g., `tesseract.js`) executed on the application server. No third-party API cost.
3. **Layer 3 — Rule-based classification and quality detection.** A library of regex / heuristic patterns identifies document type (e.g., presence of "United States Department of Justice — Executive Office for Immigration Review" → "Notice to Appear") and assigns a quality score based on OCR confidence, page count, image sharpness, and visible-form-field heuristics.
4. **Layer 4 — Optional remote AI escalation.** Only if Layer 3 confidence is below a per-firm threshold, the pipeline calls a third-party LLM (e.g., Hugging Face Inference Providers or a private Inference Endpoint running a Qwen2.5-VL or SmolDocling model) for either (a) re-classification of the document type or (b) generation of a client-friendly natural-language explanation of why the document needs to be re-uploaded.
5. **Per-firm configuration plane.** A `firm_settings` table allows each tenant firm to (a) override the AI provider (`mock`, `local_ocr_only`, `huggingface_provider`, `huggingface_endpoint`), (b) set escalation thresholds, (c) supply a custom document-type vocabulary, and (d) enable/disable Layer 4 entirely. This is the mechanism that lets the same pipeline serve a sub-$50/month customer (Layers 1–3 only) and an enterprise customer (Layers 1–4) without code changes.
6. **Asynchronous job orchestration.** A `processing_jobs` queue claims work, records per-stage latency and provider, escalates failures into a `needs_review` state surfaced in a human-in-the-loop review UI, and emits a per-document audit trail.

## 5. Novel and non-obvious elements

In the inventor's good-faith view (subject to a prior-art search by counsel), the following combinations are believed to be novel and non-obvious:

1. **Tenant-configurable, threshold-gated escalation** between local OCR + rule-based classification and remote LLM classification, where the threshold and the remote model are per-firm settings, applied to attorney–client document intake.
2. **Use of remote LLM output as an *outbound client communication generator*** rather than a classifier of record — i.e., the LLM's job is to produce a polite, plain-English re-upload request to the end-client, not to bind the firm's classification.
3. **Quality flagging that produces an actionable reason code** mapped to a re-capture instruction (e.g., "Page 2 cut off — please retake with the entire page in frame") rather than a generic confidence score.
4. **Audit-grade per-stage telemetry** (latency, provider, layer-of-final-decision) emitted into a queryable jobs table so the firm can demonstrate to a court, a bar disciplinary committee, or an enterprise security reviewer **exactly which stage made which decision on which document**.
5. **Mock-mode parity.** All external integrations (LLM provider, email, SMS, payments) have functional mock implementations triggered by the absence of credentials, allowing a firm to onboard, see real results, and adopt the product without ever transmitting client data to third parties — and then to *progressively* enable subprocessors as their data-governance review allows.

## 6. Best mode known to the inventor

The best mode known at the time of disclosure is the implementation reflected in the working repository, specifically the modules under `src/lib/processing/`, `src/lib/ai/`, and the database schema in `supabase/migrations/`. The repository at commit `[GIT SHA AT FILING]` is the authoritative reference for "best mode."

## 7. Drawings (to attach to provisional)

Counsel will format these for filing. The figures already implied by the architecture include:

- **Fig. 1** — End-to-end pipeline block diagram (client browser → upload → preprocessing → OCR → rule-based → optional LLM → review queue → firm case file).
- **Fig. 2** — State machine for an `uploaded_files` row (`uploaded` → `processing` → `completed` | `needs_review` | `failed`).
- **Fig. 3** — Threshold-gated escalation decision flow (Layer 3 confidence → branch on per-firm threshold → escalate or finalize).
- **Fig. 4** — Per-firm configuration schema and how it parameterizes the pipeline.
- **Fig. 5** — Job queue lifecycle (`queued` → `running` → `completed` | `failed`, with attempts, latency, provider columns).
- **Fig. 6** — Re-upload reason generation flow (quality flag → Layer 4 LLM prompt → outbound client SMS/email).

## 8. Prior art known to the inventor (good-faith disclosure)

The inventor is aware of, and the invention is intended to be distinguishable from, the following prior art (non-exhaustive — counsel should run a full search):

- Google Document AI, Amazon Textract, Microsoft Azure Document Intelligence (general-purpose page-by-page document extraction services).
- Open-source OCR engines: Tesseract, PaddleOCR, EasyOCR.
- Document-classifier models on Hugging Face including `docling-project/SmolDocling` and Qwen-VL family models.
- Generic legal-tech document intake products (Clio, MyCase, Filevine intake modules), which to the inventor's knowledge do not implement tenant-configurable threshold-gated escalation between local rules and remote LLMs.

## 9. Public disclosure log

| Date | Audience | Forum | What was disclosed |
| --- | --- | --- | --- |
| `[YYYY-MM-DD]` | `[NAME]` | private call | high-level concept under NDA |
| | | | (add rows for every demo, conference talk, blog post, tweet, public GitHub release) |

> **If any row above is non-NDA and predates the provisional filing, tell counsel immediately** — this affects U.S. grace period and may already foreclose foreign filings.

## 10. Inventor's certification

I, `[FOUNDER NAME]`, certify that:
1. I am the sole inventor of the subject matter described above;
2. I conceived this invention without using the confidential information of any prior employer;
3. The information in this memorandum is true and complete to the best of my knowledge;
4. I have not assigned any rights in this invention to any party other than `[LLC NAME]` (or, prior to the IP Assignment, to no party); and
5. I will promptly disclose any further improvements or modifications to counsel.

Signature: ____________________________
Print name: `[FOUNDER NAME]`
Date: ____________________________

Witness signature: ____________________________
Witness name: `[WITNESS NAME]`
Date: ____________________________

> **Witness tip.** A witness's signature on this memo (someone other than the inventor, ideally not a co-inventor or business partner) materially strengthens the contemporaneous-record value of this document if it is ever introduced as evidence of conception date.
