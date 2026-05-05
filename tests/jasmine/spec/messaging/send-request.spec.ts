/**
 * Unit tests for the dispatch decision and status-rollup helpers used by
 * `sendRequestEmailAndSms`.
 *
 * The orchestrator itself talks to Supabase, Resend, and Twilio, so we
 * intentionally test it at the seam: `planChannels` decides which channels
 * fire, `combinedStatus` rolls per-channel results back into the
 * `document_requests.status` value. If either of these regresses we'd send
 * the wrong number of messages or write the wrong status to the DB —
 * exactly the failures most likely to silently break the client experience.
 */
import { combinedStatus, planChannels } from "@/lib/messaging/send-request";

describe("lib/messaging/send-request > planChannels", () => {
  describe("preferred_contact = 'email'", () => {
    it("sends email when an email address is on file", () => {
      const plan = planChannels("email", "client@example.test", "+15551234567");
      expect(plan.willSendEmail).toBeTrue();
      expect(plan.willSendSms).toBeFalse();
      expect(plan.reason).toBeUndefined();
    });

    it("ignores the phone number even when SMS is technically available", () => {
      const plan = planChannels("email", "client@example.test", "+15551234567");
      expect(plan.willSendSms).toBeFalse();
    });

    it("flags 'no_contact' when the email address is missing", () => {
      const plan = planChannels("email", null, "+15551234567");
      expect(plan.willSendEmail).toBeFalse();
      expect(plan.willSendSms).toBeFalse();
      expect(plan.reason).toBe("no_contact");
    });
  });

  describe("preferred_contact = 'sms'", () => {
    it("sends SMS when a phone number is on file", () => {
      const plan = planChannels("sms", "client@example.test", "+15551234567");
      expect(plan.willSendEmail).toBeFalse();
      expect(plan.willSendSms).toBeTrue();
      expect(plan.reason).toBeUndefined();
    });

    it("ignores the email address even when email is technically available", () => {
      const plan = planChannels("sms", "client@example.test", "+15551234567");
      expect(plan.willSendEmail).toBeFalse();
    });

    it("flags 'no_contact' when the phone number is missing", () => {
      const plan = planChannels("sms", "client@example.test", null);
      expect(plan.willSendEmail).toBeFalse();
      expect(plan.willSendSms).toBeFalse();
      expect(plan.reason).toBe("no_contact");
    });
  });

  describe("preferred_contact = 'both'", () => {
    it("sends both channels when both contacts are on file", () => {
      const plan = planChannels("both", "client@example.test", "+15551234567");
      expect(plan.willSendEmail).toBeTrue();
      expect(plan.willSendSms).toBeTrue();
      expect(plan.reason).toBeUndefined();
    });

    it("falls back to SMS only when email is missing", () => {
      const plan = planChannels("both", null, "+15551234567");
      expect(plan.willSendEmail).toBeFalse();
      expect(plan.willSendSms).toBeTrue();
      expect(plan.reason).toBeUndefined();
    });

    it("falls back to email only when phone is missing", () => {
      const plan = planChannels("both", "client@example.test", null);
      expect(plan.willSendEmail).toBeTrue();
      expect(plan.willSendSms).toBeFalse();
      expect(plan.reason).toBeUndefined();
    });

    it("flags 'no_contact' when neither contact is on file", () => {
      const plan = planChannels("both", null, null);
      expect(plan.willSendEmail).toBeFalse();
      expect(plan.willSendSms).toBeFalse();
      expect(plan.reason).toBe("no_contact");
    });
  });

  it("treats an empty-string email as missing (defensive — DB allows it)", () => {
    const plan = planChannels("email", "", "+15551234567");
    expect(plan.willSendEmail).toBeFalse();
    expect(plan.reason).toBe("no_contact");
  });

  it("treats an empty-string phone as missing", () => {
    const plan = planChannels("sms", "client@example.test", "");
    expect(plan.willSendSms).toBeFalse();
    expect(plan.reason).toBe("no_contact");
  });
});

describe("lib/messaging/send-request > combinedStatus", () => {
  it("returns 'failed' when no channel was attempted", () => {
    expect(combinedStatus()).toBe("failed");
    expect(combinedStatus(undefined)).toBe("failed");
    expect(combinedStatus(undefined, undefined)).toBe("failed");
  });

  it("returns 'sent' if any channel hit a real provider", () => {
    expect(combinedStatus("sent")).toBe("sent");
    expect(combinedStatus("sent", "sent_mock")).toBe("sent");
    expect(combinedStatus("sent", "failed")).toBe("sent");
    expect(combinedStatus("sent_mock", "sent")).toBe("sent");
  });

  it("returns 'sent_mock' only when every attempted channel was mock", () => {
    expect(combinedStatus("sent_mock")).toBe("sent_mock");
    expect(combinedStatus("sent_mock", "sent_mock")).toBe("sent_mock");
    // Even if a channel was skipped (undefined), as long as none failed,
    // a single mock should still roll up as 'sent_mock'.
    expect(combinedStatus("sent_mock", undefined)).toBe("sent_mock");
    expect(combinedStatus(undefined, "sent_mock")).toBe("sent_mock");
  });

  it("returns 'failed' when every attempted channel failed", () => {
    expect(combinedStatus("failed")).toBe("failed");
    expect(combinedStatus("failed", "failed")).toBe("failed");
    expect(combinedStatus(undefined, "failed")).toBe("failed");
  });

  it("returns 'failed' when one channel failed and the other was only mock-mode", () => {
    // Documenting current behaviour: a mock-mode result means "no provider
    // configured, we couldn't even try a real send", so it can't excuse a
    // real failure on the other channel. Only an actual `sent` masks a
    // `failed` sibling.
    expect(combinedStatus("sent_mock", "failed")).toBe("failed");
    expect(combinedStatus("failed", "sent_mock")).toBe("failed");
  });
});
