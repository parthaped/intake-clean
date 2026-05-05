/**
 * Unit tests for `sendSms`.
 *
 * No Twilio env vars are set in `tests/register.mjs`, so every call here
 * exercises the mock-mode branch. Same contract as `sendEmail`: never throw,
 * never call the network, always return `{ ok, status, providerMessageId }`
 * so callers can persist the right `client_messages.status`.
 */
import { sendSms } from "@/lib/messaging/sms";
import { renderInitial, renderReminder } from "@/lib/messaging/templates";

describe("lib/messaging/sms > sendSms", () => {
  let infoSpy: jasmine.Spy;
  beforeEach(() => {
    infoSpy = spyOn(console, "info");
  });

  it("returns a 'sent_mock' result when Twilio env vars are not configured", async () => {
    const result = await sendSms({
      to: "+15551234567",
      body: "Please upload your documents.",
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
    expect(result.providerMessageId).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("logs a mock-mode breadcrumb with the recipient and a 160-char preview", async () => {
    const longBody = "B".repeat(500);
    await sendSms({
      to: "+15551234567",
      body: longBody,
    });

    expect(infoSpy).toHaveBeenCalled();
    const [tag, payload] = infoSpy.calls.mostRecent().args as [string, Record<string, unknown>];
    expect(tag).toBe("[mock-sms]");
    expect(payload.to).toBe("+15551234567");
    expect((payload.preview as string).length).toBe(160);
  });

  it("does not throw when sending the rendered initial-outreach SMS body", async () => {
    const message = renderInitial({
      firmName: "Acme Law",
      clientName: "Jane Doe",
      matterName: "Estate of John Doe",
      uploadLink: "https://intakeclean.test/u/abc123",
    });

    const result = await sendSms({
      to: "+15551234567",
      body: message.smsBody,
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
  });

  it("does not throw when sending the rendered reminder SMS body", async () => {
    const message = renderReminder({
      firmName: "Acme Law",
      clientName: "Jane Doe",
      matterName: "Estate of John Doe",
      uploadLink: "https://intakeclean.test/u/abc123",
    });

    const result = await sendSms({
      to: "+15551234567",
      body: message.smsBody,
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe("sent_mock");
  });

  it("returns the same mock-mode shape regardless of phone number formatting", async () => {
    // Twilio strictly wants E.164. We don't validate here because the API
    // does — but the mock branch should be format-agnostic.
    const a = await sendSms({ to: "+1 (555) 123-4567", body: "hi" });
    const b = await sendSms({ to: "555-123-4567", body: "hi" });
    const c = await sendSms({ to: "+15551234567", body: "hi" });
    for (const r of [a, b, c]) {
      expect(r.ok).toBeTrue();
      expect(r.status).toBe("sent_mock");
      expect(r.providerMessageId).toBeNull();
    }
  });
});
