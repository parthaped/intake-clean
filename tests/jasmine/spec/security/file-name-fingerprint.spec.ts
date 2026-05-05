import { fingerprintFileName } from "@/lib/uploads/file-name-fingerprint";

/**
 * Pen-test the filename fingerprinter we use in audit logs.
 *
 * Threat model: clients regularly upload files named
 * `passport_john_smith_ssn_123456789.pdf` — the filename itself contains
 * PII. We want audit-log readability (joinable across events) without
 * disclosure (no plaintext leaks of the original name).
 */
describe("security: filename fingerprint", () => {
  it("returns a 64-char SHA-256 hex digest", () => {
    const { sha256 } = fingerprintFileName("anything.pdf");
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never returns the original filename in the digest", () => {
    const name = "passport_john_smith_ssn_123-45-6789.pdf";
    const { sha256, ext } = fingerprintFileName(name);
    expect(sha256).not.toContain("passport");
    expect(sha256).not.toContain("john");
    expect(sha256).not.toContain("smith");
    expect(sha256).not.toContain("123");
    expect(ext).toBe("pdf");
  });

  it("is deterministic for identical inputs (joinable across events)", () => {
    const a = fingerprintFileName("Birth Certificate.pdf");
    const b = fingerprintFileName("Birth Certificate.pdf");
    expect(a.sha256).toBe(b.sha256);
  });

  it("is sensitive to any change (collision avoidance)", () => {
    const a = fingerprintFileName("client-1.pdf");
    const b = fingerprintFileName("client-2.pdf");
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("extracts the extension lowercased", () => {
    expect(fingerprintFileName("scan.PDF").ext).toBe("pdf");
    expect(fingerprintFileName("photo.JPEG").ext).toBe("jpeg");
    expect(fingerprintFileName("doc.tar.gz").ext).toBe("gz");
  });

  it("returns empty extension for files without a dot", () => {
    expect(fingerprintFileName("README").ext).toBe("");
    expect(fingerprintFileName("file.").ext).toBe("");
  });

  it("is safe with adversarial filenames", () => {
    const inputs = [
      "../../etc/passwd",
      "C:\\Windows\\System32\\evil.exe",
      "file\u0000.pdf",
      "💀💥.pdf",
      "a".repeat(10_000),
    ];
    for (const value of inputs) {
      expect(() => fingerprintFileName(value)).not.toThrow();
      const { sha256 } = fingerprintFileName(value);
      expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
