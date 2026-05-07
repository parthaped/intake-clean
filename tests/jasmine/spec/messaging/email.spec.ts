/**
 * Unit tests for `sendEmail`.
 *
 * The test process is started without a `RESEND_API_KEY` (see
 * `tests/register.mjs`), so every call here exercises the mock-mode branch:
 * we should NEVER hit the network, the function should NEVER throw, and the
 * returned shape must match the contract that `sendRequestEmailAndSms` and
 * the `client_messages.status` column rely on.
 *
 * If a future change makes `sendEmail` throw or return something other than
 * `{ ok: true, status: "sent_mock", providerMessageId: null }` when no
 * provider is configured, this file is the canary.
 */
import { sendEmail } from "@/lib/messaging/email";
import { renderInitial, renderReminder } from "@/lib/messaging/templates";

describe("lib/messaging/email > sendEmail", () => {
  // Silence the "[mock-email]" console.info logs so the test output stays
  // readable; we still want to assert that they fire (see "logs a mock"
  // spec below) but we don't need them spamming the runner.
  let infoSpy: jasmine.Spy;
  beforeEach(() => {
    infoSpy = spyOn(console, "info");
  });

  it("returns a 'sent_mock' result with a diagnostic mock-reason when RESEND_API_KEY is not configured", async () => {
    const result = await sendEmail({
      to: "client@example.test",
      subject: "Documents needed",
      text: "Please upload your documents.",
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
    expect(result.providerMessageId).toBeNull();
    // The mock branch tags the result with the reason so the orchestrators
    // can persist it to `client_messages.error_message` and the dashboard
    // Messages tab can render "Mock mode — RESEND_API_KEY not configured…"
    // instead of leaving staff guessing why mail isn't arriving.
    expect(result.error).toContain("RESEND_API_KEY");
  });

  it("logs a mock-mode breadcrumb so staff can see what would have been sent", async () => {
    await sendEmail({
      to: "client@example.test",
      subject: "Mock subject",
      text: "Mock body",
    });

    expect(infoSpy).toHaveBeenCalled();
    const [tag, payload] = infoSpy.calls.mostRecent().args as [string, Record<string, unknown>];
    expect(tag).toBe("[mock-email]");
    expect(payload.to).toBe("client@example.test");
    expect(payload.subject).toBe("Mock subject");
    // The preview field exists so PII isn't unintentionally dumped wholesale
    // into logs — we just assert it's a short string that starts with the
    // body content.
    expect(typeof payload.preview).toBe("string");
    expect((payload.preview as string).length).toBeLessThanOrEqual(200);
    expect((payload.preview as string).startsWith("Mock body")).toBeTrue();
  });

  it("truncates very long bodies to 200 characters in the preview log", async () => {
    const longBody = "A".repeat(1000);
    await sendEmail({
      to: "client@example.test",
      subject: "Long",
      text: longBody,
    });
    const [, payload] = infoSpy.calls.mostRecent().args as [string, Record<string, unknown>];
    expect((payload.preview as string).length).toBe(200);
  });

  it("does not throw when sending the rendered initial-outreach template", async () => {
    const message = renderInitial({
      firmName: "Acme Law",
      clientName: "Jane Doe",
      matterName: "Estate of John Doe",
      uploadLink: "https://intakeclean.test/u/abc123",
    });

    const result = await sendEmail({
      to: "jane@example.test",
      subject: message.subject,
      text: message.emailBody,
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
  });

  it("does not throw when sending the rendered reminder template", async () => {
    const message = renderReminder({
      firmName: "Acme Law",
      clientName: "Jane Doe",
      matterName: "Estate of John Doe",
      uploadLink: "https://intakeclean.test/u/abc123",
    });

    const result = await sendEmail({
      to: "jane@example.test",
      subject: message.subject,
      text: message.emailBody,
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
  });

  it("accepts an optional replyTo address without changing the mock result shape", async () => {
    const result = await sendEmail({
      to: "client@example.test",
      subject: "Hi",
      text: "Body",
      replyTo: "firm-reply@example.test",
    });
    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
    expect(result.providerMessageId).toBeNull();
  });

  it("accepts an optional html body and still returns the mock result shape", async () => {
    const result = await sendEmail({
      to: "client@example.test",
      subject: "Branded subject",
      text: "Plain-text fallback",
      html: "<table><tr><td>Pretend HTML</td></tr></table>",
    });
    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
    expect(result.providerMessageId).toBeNull();
  });

  it("flags hasHtml=true in the mock breadcrumb when an html body is provided", async () => {
    await sendEmail({
      to: "client@example.test",
      subject: "Branded subject",
      text: "Plain-text fallback",
      html: "<table>HTML body</table>",
    });
    const [, payload] = infoSpy.calls.mostRecent().args as [string, Record<string, unknown>];
    expect(payload.hasHtml).toBeTrue();
    // The breadcrumb preview must still come from the plain-text body —
    // we never want raw HTML markup leaking into application logs.
    expect(payload.preview).toBe("Plain-text fallback");
  });

  it("flags hasHtml=false in the mock breadcrumb when no html body is provided", async () => {
    await sendEmail({
      to: "client@example.test",
      subject: "Plain only",
      text: "Body",
    });
    const [, payload] = infoSpy.calls.mostRecent().args as [string, Record<string, unknown>];
    expect(payload.hasHtml).toBeFalse();
  });
});
