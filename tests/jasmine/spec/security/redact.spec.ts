import { redactPII } from "@/lib/security/redact";

/**
 * Pen-test the PII redactor that runs over OCR text immediately before we
 * ship it to a third-party model (Hugging Face). The threat model is:
 *
 *   "An attacker submits a document containing real PII (SSN, passport,
 *   email) hoping the value lands inside an external prompt that we then
 *   log on the provider's side. We must guarantee the value never leaves
 *   our infrastructure intact."
 *
 * The redactor is allowed to be over-eager (false positives are fine — the
 * downstream model only needs the "shape" of the data) but it must NEVER
 * leak a true positive in any of the formats clients realistically send.
 */
describe("security: PII redactor", () => {
  function expectScrubbed(label: string, original: string, mustNotContain: string) {
    const result = redactPII(original);
    expect(result.text).not.toContain(mustNotContain);
    expect(result.text).toContain("[REDACTED:");
    expect(result.totalRedactions).toBeGreaterThan(0);
    expect(result.counts[label] ?? 0).toBeGreaterThan(0);
  }

  describe("SSN attack vectors", () => {
    it("strips dashed SSNs", () => {
      expectScrubbed("ssn", "Client SSN: 123-45-6789 on file.", "123-45-6789");
    });
    it("strips space-separated SSNs", () => {
      expectScrubbed("ssn", "SSN 123 45 6789", "123 45 6789");
    });
    it("strips bare 9-digit SSN runs surrounded by punctuation", () => {
      expectScrubbed("ssn", "applicant: 123456789 (verify)", "123456789");
    });
    it("errs on the side of redacting 9-digit runs even when surrounded by hyphens", () => {
      // The bare-9-digit rule has a hyphen guard, but the passport rule
      // (`[A-Z]?\d{8,9}`) is allowed to match here. Our doctrine is
      // "over-redact rather than under-redact" for outbound text — the
      // downstream model only needs the SHAPE — so this is the desired
      // behaviour.
      const r = redactPII("file-123456789-attachment");
      expect(r.text).not.toContain("123456789");
      expect(r.totalRedactions).toBeGreaterThan(0);
    });
  });

  describe("identity-document attack vectors", () => {
    it("strips US passport-style numbers", () => {
      expectScrubbed("passport", "Passport: A12345678 issued 01/02/2020", "A12345678");
    });
    it("strips driver-license-shaped IDs", () => {
      expectScrubbed("drivers_license", "DL no D1234567A", "D1234567A");
    });
    it("strips EINs", () => {
      expectScrubbed("ein", "Firm EIN: 12-3456789", "12-3456789");
    });
  });

  describe("financial attack vectors", () => {
    it("strips contiguous credit card numbers", () => {
      expectScrubbed("card", "card 4111111111111111 expires", "4111111111111111");
    });
    it("strips space-grouped credit card numbers", () => {
      expectScrubbed("card", "card 4111 1111 1111 1111", "4111 1111 1111 1111");
    });
    it("strips hyphen-grouped credit card numbers", () => {
      expectScrubbed("card", "card 4111-1111-1111-1111", "4111-1111-1111-1111");
    });
  });

  describe("contact attack vectors", () => {
    it("strips email addresses regardless of position", () => {
      expectScrubbed("email", "Reach me at jane.doe+intake@example.co.uk", "jane.doe+intake@example.co.uk");
    });
    it("strips US phone numbers in any common format", () => {
      const variants = ["(415) 555-0123", "415-555-0123", "415.555.0123", "415 555 0123", "4155550123"];
      for (const v of variants) {
        const r = redactPII(`call ${v} thanks`);
        expect(r.text).not.toContain(v);
      }
    });
    it("strips dates of birth (US and EU formats)", () => {
      expectScrubbed("dob", "DOB 03/14/1990 noted", "03/14/1990");
      expectScrubbed("dob", "DOB 14-03-1990 noted", "14-03-1990");
    });
  });

  describe("composition attacks", () => {
    it("scrubs a document where every line contains different PII", () => {
      const blob = [
        "Name: Jane Doe",
        "SSN: 123-45-6789",
        "DOB: 03/14/1990",
        "Email: jane@example.com",
        "Phone: (415) 555-0199",
        "Card: 4111-1111-1111-1111",
      ].join("\n");
      const r = redactPII(blob);
      // Counts should add up — at least 5 categories matched.
      const distinctLabels = Object.keys(r.counts).length;
      expect(distinctLabels).toBeGreaterThanOrEqual(5);
      // None of the raw values should remain.
      for (const leak of [
        "123-45-6789",
        "03/14/1990",
        "jane@example.com",
        "415) 555-0199",
        "4111-1111-1111-1111",
      ]) {
        expect(r.text).not.toContain(leak);
      }
    });

    it("returns the original text when there is no PII", () => {
      const r = redactPII("This is a normal sentence about a passport application.");
      expect(r.totalRedactions).toBe(0);
      expect(r.text).toBe("This is a normal sentence about a passport application.");
    });

    it("never throws on empty / whitespace input", () => {
      expect(() => redactPII("")).not.toThrow();
      expect(() => redactPII("   \n\t   ")).not.toThrow();
    });

    it("does not introduce extra newlines or eat surrounding whitespace", () => {
      const r = redactPII("line1\nSSN: 123-45-6789\nline3");
      expect(r.text.split("\n").length).toBe(3);
    });
  });
});
