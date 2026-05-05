# Provisional Patent Application

> **Filing instructions.**
>
> 1. **Have a registered patent agent or patent attorney review this document before filing.** A provisional only protects what is *described in detail* — anything you remove from the specification before filing is **not** protected by the priority date. There is no second chance.
> 2. File electronically via [USPTO Patent Center](https://patentcenter.uspto.gov) using cover sheet **SB/16** ("Provisional Application for Patent Cover Sheet").
> 3. Filing fees as of the most recent USPTO fee schedule: **$65 micro-entity / $130 small entity / $260 large entity**. Verify the current fee at <https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule> before submitting.
> 4. **The 12-month deadline is non-extendable.** Calendar the non-provisional (utility) filing date the moment the provisional is filed.
> 5. The Inventor's Declaration is signed at the time of filing the **non-provisional**, not the provisional. Do not pre-sign.

---

## Title of Invention

**Multi-Layer Adaptive Document Intake Pipeline with Tenant-Configurable, Threshold-Gated Escalation Between Local Rule-Based Analysis and Remote Large Language Model Classification**

---

## Cross-Reference to Related Applications

None.

## Statement Regarding Federally Sponsored Research

Not applicable.

## Background of the Invention

### Field of the invention

The present invention relates generally to systems and methods for ingesting heterogeneous client-supplied documents into a downstream professional-services workflow, and more particularly to a multi-stage document-processing pipeline that escalates between local deterministic processing, local optical character recognition, rule-based classification, and remote large language model (LLM) inference based on per-tenant configurable confidence thresholds.

### Description of related art

Small professional-services firms — including small law firms, paralegals, accountants, and medical practices — routinely receive client-supplied documents in the form of mobile-phone photographs, screenshots, faxes, scans, and PDFs of variable quality. Existing solutions for processing these inputs fall into three categories, each with deficiencies:

**(a) Per-page document AI services.** Cloud document-AI offerings (e.g., the services described as "Document AI," "Textract," and "Document Intelligence" by major cloud vendors) charge a per-page fee for every input regardless of input quality, and route every page through the vendor's infrastructure regardless of the sensitivity of the contents. This (i) makes per-document cost prohibitive at low SaaS price points, and (ii) raises confidentiality concerns when the documents contain attorney–client privileged material or sensitive personal information.

**(b) Open-source OCR pipelines.** Open-source optical character recognition engines (Tesseract, PaddleOCR, EasyOCR) can extract text without external API calls, but they do not classify documents, do not assign quality scores, do not produce actionable instructions for re-capture, and provide no escalation path when their output is unusable.

**(c) Vertical legal-tech intake products.** Existing legal-tech intake modules typically present a passive upload form to the end-client and pass whatever is uploaded into the case file, leaving the firm's staff to manually triage, classify, and request re-uploads.

None of the foregoing addresses the combined need for (i) low and predictable per-document compute cost, (ii) configurable confidentiality boundaries set per-tenant, (iii) automated quality triage that yields a *specific actionable* re-capture instruction to the end-client, and (iv) an audit-grade per-stage record of which processing stage made which decision on each document.

## Summary of the Invention

The present invention provides a system and method for ingesting client-supplied documents through a configurable, multi-layer pipeline in which (a) each successive layer is more computationally expensive and/or involves more external dependencies than the prior layer; (b) escalation from one layer to the next is gated by a per-tenant configurable confidence threshold; and (c) the decision of which layer's output is treated as authoritative for a given document is recorded in a per-document audit log.

In a representative embodiment, the pipeline comprises:

1. A **first layer** comprising deterministic preprocessing operations including format conversion, exposure normalization, deskew, and orientation detection, performed without invoking any machine-learning model.

2. A **second layer** comprising local optical character recognition executed on the application server.

3. A **third layer** comprising rule-based document-type classification and image-quality scoring derived from the second layer's textual output and from image features.

4. An **optional fourth layer** comprising remote large-language-model inference, invoked only when the third layer's confidence score falls below a per-tenant configurable threshold, and used to produce either (i) a refined document-type classification or (ii) a natural-language instruction to be transmitted to the end-client requesting a re-capture of the document.

5. A **per-tenant configuration store** parameterizing the pipeline, including without limitation: the active provider for the fourth layer (e.g., none, a public LLM-inference provider, or a private inference endpoint); the escalation threshold for each decision point; a tenant-specific document-type vocabulary; and feature toggles for individual layers.

6. An **asynchronous job orchestrator** that claims work from a queue, records per-stage latency and provider, transitions documents through a state machine including a `needs_review` state surfaced in a human-in-the-loop review interface, and emits a per-document audit trail.

In an additional aspect, the system implements **mock-mode parity**, wherein the absence of credentials for any external dependency causes the pipeline to substitute a functional in-process implementation, allowing a tenant to onboard and observe end-to-end behavior without transmitting any data to a third party, and to progressively enable external subprocessors as the tenant's data-governance review permits.

## Brief Description of the Drawings

- **FIG. 1** is a block diagram of the multi-layer document intake pipeline.
- **FIG. 2** is a state machine diagram for the lifecycle of an uploaded document record.
- **FIG. 3** is a flowchart of the threshold-gated escalation decision applied at each layer.
- **FIG. 4** is a schematic of the per-tenant configuration store and its effect on pipeline behavior.
- **FIG. 5** is a block diagram of the asynchronous job orchestrator and its queue.
- **FIG. 6** is a flowchart of the natural-language re-capture instruction generation process.

> Counsel: please render formal black-and-white line drawings consistent with 37 C.F.R. § 1.84 prior to filing. The descriptions below are sufficient to support these figures.

## Detailed Description

### System architecture overview (FIG. 1)

In a representative embodiment, the system comprises:

- A web client (e.g., a single-page application served from a cloud hosting platform) by which an end-client of a tenant firm uploads one or more documents.
- An application server (e.g., a Next.js / Node.js process executing on serverless infrastructure) implementing the API endpoints and the pipeline stages.
- A relational data store (e.g., PostgreSQL) holding tables for `uploaded_files`, `processing_jobs`, `firm_settings`, `firms`, `clients`, and `document_requests`, with row-level security policies enforcing per-tenant isolation.
- An object store for the uploaded binary content.
- One or more optional external integrations: an LLM inference provider, a transactional email provider, a transactional SMS provider, and a payment processor.

Each upload event creates a row in `uploaded_files` and enqueues a row in `processing_jobs` referencing it. The `processing_jobs` row records, at minimum: the originating tenant identifier, the target document identifier, the current state (`queued`, `running`, `completed`, `failed`), the number of attempts, timestamps for `started_at` and `completed_at`, the recorded provider for the deciding layer, and a measured latency in milliseconds.

### Pipeline stages

**Layer 1 — Deterministic preprocessing.** For each input, the system inspects the MIME type and applies one or more of: HEIC-to-JPEG conversion, PDF page rasterization, JPEG re-encoding with controlled exposure and contrast normalization, deskew, and orientation classification. No machine-learning model is invoked at this layer. The output of Layer 1 is one or more normalized image files associated with the original `uploaded_files` row.

**Layer 2 — Local optical character recognition.** The system invokes an OCR engine executing locally to the application server (in a representative embodiment, `tesseract.js`) on each normalized image. The OCR engine produces a textual transcript and a per-token confidence distribution. The system stores the transcript and a derived aggregate confidence score on the `uploaded_files` row.

**Layer 3 — Rule-based classification and quality scoring.** The system applies a library of patterns — including without limitation regular expressions matched against the OCR transcript, image-feature heuristics (sharpness, edge density, page-count detection), and combinations thereof — to assign (a) a document-type label drawn from a tenant-configurable vocabulary, and (b) a quality score on a normalized scale. Each rule may emit a structured "reason code" (e.g., `page_cut_off`, `glare`, `low_resolution`, `wrong_orientation`, `multiple_documents_on_one_page`) which maps to a tenant-configurable corrective instruction.

**Layer 4 (optional) — Remote LLM escalation.** If the aggregate confidence produced by Layer 3 is less than a tenant-configured threshold T₃, or if Layer 3 emits a reason code flagged for client communication, the system invokes a remote LLM with one of two prompt templates:
- A *classification prompt* presenting the OCR transcript (and optionally the normalized image, in a vision-language embodiment) and the tenant's document-type vocabulary, requesting a single label and a confidence value.
- A *client-communication prompt* presenting the reason code(s) and any context the firm has supplied, requesting a brief, plain-language message addressed to the end-client describing what to re-capture and how.

The system records the provider identifier, the prompt hash, the response, and the latency on the `processing_jobs` row.

### Threshold-gated escalation (FIG. 3)

At each transition between layers, the system reads from the per-tenant configuration store the relevant threshold(s) and feature toggles. In a representative embodiment, the configuration includes:
- `ai_provider`: one of `mock`, `local_ocr_only`, `huggingface_provider`, `huggingface_endpoint`.
- `ocr_engine`: one of `tesseract`, `paddleocr`, `mock`, `none`.
- `use_local_ocr`: boolean.
- `use_hf_classification`: boolean.
- `use_hf_explanations`: boolean.
- `escalation_threshold_classification`: numeric in [0, 1].
- `escalation_threshold_quality`: numeric in [0, 1].

If a feature toggle is disabled, the corresponding layer is bypassed, and downstream layers (which would have used its output) operate on the prior layer's best available output. This permits a tenant to operate the pipeline entirely on Layers 1–3 (no third-party transmission) while another tenant uses Layers 1–4 with a chosen provider.

### Mock-mode parity

For each external integration, the system maintains two implementations: a real implementation that calls the external service, and a mock implementation that produces a deterministic or pseudo-random in-process result. The system selects the mock implementation when (a) the relevant credential environment variables are not present, or (b) a tenant configuration explicitly selects the mock provider. The mock implementations write structured log entries identifiable by a `[mock-…]` prefix and persist their outputs in the same data shape as the real implementations, so the rest of the system is invariant to the choice.

### Asynchronous job orchestration (FIG. 5)

A drain procedure repeatedly:
1. Selects up to N rows from `processing_jobs` with state `queued`, ordered by creation time.
2. For each, atomically updates the row to state `running`, increments `attempts`, and records `started_at`.
3. Invokes the pipeline (Layers 1–4 as configured).
4. On success, updates the row to `completed` and records `completed_at`, `latency_ms`, and `provider`.
5. On failure, updates the row to `failed`, records the error message and timing, and updates the corresponding `uploaded_files` row to a `needs_review` state surfaced in a human-in-the-loop review interface.

This separation of `uploaded_files.status` (visible to the firm's staff) from `processing_jobs.status` (operational) allows the staff-facing view of a document to remain stable even as background retries occur.

### State machine for `uploaded_files` (FIG. 2)

A representative state machine for an `uploaded_files` row is:

`uploaded` → `processing` → (`completed` | `needs_review` | `rejected`)

with transitions to `needs_review` on Layer-3 quality failure, on Layer-4 low-confidence classification, or on pipeline failure.

### Audit trail

For each document, the system retains: the layer that produced the final classification, the provider invoked at each layer, the prompt hash and response identifier (where applicable), the timing of each stage, and any reason codes emitted. This per-document audit log is queryable by the firm's administrators and is suitable for production in response to a bar disciplinary inquiry, an enterprise security review, or an end-client request for an accounting of how their document was handled.

### Variations

- The OCR engine of Layer 2 may be substituted with any equivalent open-source or proprietary engine without departing from the scope of the invention; the salient feature is that Layer 2 executes locally to the application server and does not transmit data to a third party.
- The remote LLM of Layer 4 may be a public inference provider, a private inference endpoint controlled by the tenant or by the operator, or, in an enterprise deployment, an LLM running on infrastructure controlled by the tenant; the salient feature is that escalation to Layer 4 is gated by per-tenant configuration.
- Additional layers may be inserted between Layers 3 and 4 — for example, a layer applying a small specialized classification model held locally — without departing from the threshold-gated escalation principle.
- The system may operate on documents other than legal documents, including without limitation medical records, insurance forms, financial statements, immigration forms, real-estate closing documents, and academic transcripts.

## Claims (Provisional — Informational Only)

> **Note.** A provisional application does not require formal claims. The following claim-form statements are included to (a) sharpen the description above, (b) guide counsel in drafting the formal claims of the corresponding non-provisional application within 12 months, and (c) make the scope of the invention legible to investors and acquirers reading this file.

**1.** A computer-implemented method for processing a client-supplied document in a multi-tenant intake system, the method comprising:
   (a) receiving, at an application server, an uploaded document associated with a tenant identifier;
   (b) executing a deterministic preprocessing layer producing one or more normalized images;
   (c) executing a local optical character recognition layer producing a textual transcript and an aggregate confidence score;
   (d) executing a rule-based classification and quality-scoring layer producing a document-type label, a quality score, and zero or more reason codes;
   (e) reading, from a per-tenant configuration store keyed by the tenant identifier, an escalation threshold and a feature toggle for a remote large-language-model layer;
   (f) responsive to the quality score being below the escalation threshold and the feature toggle being enabled, invoking the remote large-language-model layer with a prompt derived from the transcript and the reason codes;
   (g) recording, in an audit log keyed to the uploaded document, an identifier of the layer producing the final classification, an identifier of any external provider invoked, and per-stage latency.

**2.** The method of claim 1, wherein the rule-based layer emits a reason code mapping to a natural-language re-capture instruction, and wherein the remote large-language-model layer is invoked to produce a tenant-styled rendering of the re-capture instruction for transmission to an end-client of the tenant.

**3.** The method of claim 1, wherein the per-tenant configuration store further specifies an OCR engine selection, and wherein the local optical character recognition layer dispatches to the selected engine.

**4.** The method of claim 1, wherein each external integration referenced by the configuration store has a corresponding mock implementation that produces a deterministic in-process result of the same shape as the real implementation, and wherein the system selects the mock implementation in the absence of credentials for the external integration.

**5.** The method of claim 1, further comprising maintaining a queue of jobs each referencing an uploaded document, atomically claiming each job, recording attempts and timing on the job row, and surfacing failed jobs into a human-in-the-loop review interface accessible to administrators of the tenant.

**6.** A non-transitory computer-readable medium storing instructions that, when executed by one or more processors, cause the processors to perform the method of any of claims 1–5.

**7.** A system comprising one or more processors and the non-transitory computer-readable medium of claim 6.

## Abstract

A multi-layer adaptive document intake pipeline ingests heterogeneous client-supplied documents and escalates them through deterministic preprocessing, local optical character recognition, rule-based classification, and an optional remote large-language-model layer. Escalation between layers is gated by per-tenant configurable thresholds and feature toggles, allowing each tenant to choose its confidentiality, cost, and accuracy posture. Each external integration has a mock-mode counterpart selected when credentials are absent, enabling end-to-end onboarding without third-party transmission. An asynchronous job orchestrator records per-stage latency and provider, surfaces failures into a human-in-the-loop review queue, and maintains a per-document audit trail.

---

## Inventor information (for cover sheet SB/16)

| Field | Value |
| --- | --- |
| Inventor full legal name | `[FOUNDER NAME]` |
| Residence | `[FOUNDER ADDRESS]` |
| Citizenship | `[FOUNDER CITIZENSHIP]` |
| Mailing address | `[FOUNDER ADDRESS]` |
| Title of invention | Multi-Layer Adaptive Document Intake Pipeline with Tenant-Configurable, Threshold-Gated Escalation Between Local Rule-Based Analysis and Remote Large Language Model Classification |
| Correspondence address | `[ATTORNEY NAME], [FIRM NAME], [ADDRESS]` |
| Entity status | `[micro / small / large]` (most solo founders qualify as **micro-entity**, see 37 C.F.R. § 1.29) |
| Application type | Provisional |

> **Do not sign the Inventor's Declaration here.** The declaration is signed at the time of the **non-provisional** filing within 12 months of this provisional, on USPTO Form PTO/AIA/01.
