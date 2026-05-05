import { buildStorageKey, generateRequestToken } from "@/lib/tokens";

describe("lib/tokens", () => {
  describe("generateRequestToken", () => {
    it("returns a non-empty string", () => {
      const token = generateRequestToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("uses URL-safe base64url alphabet (no +, /, or =)", () => {
      const token = generateRequestToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("encodes 32 random bytes => 43 characters", () => {
      // 32 bytes base64url-encoded with no padding = ceil(32 * 4 / 3) = 43.
      expect(generateRequestToken().length).toBe(43);
    });

    it("produces unique tokens across many calls", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 200; i += 1) tokens.add(generateRequestToken());
      expect(tokens.size).toBe(200);
    });
  });

  describe("buildStorageKey", () => {
    it("includes the org id, matter id, scope, and a sanitized filename", () => {
      const key = buildStorageKey({
        organizationId: "org_123",
        matterId: "matter_456",
        scope: "original",
        filename: "Passport scan.pdf",
      });
      expect(key.startsWith("org_123/matter_456/original/")).toBeTrue();
      expect(key).toMatch(/Passport_scan\.pdf$/);
    });

    it("strips path traversal and unsafe characters from the filename", () => {
      const key = buildStorageKey({
        organizationId: "org",
        matterId: "matter",
        scope: "processed",
        filename: "../../etc/passwd",
      });
      expect(key).not.toContain("..");
      expect(key).not.toContain("/etc/");
      expect(key.startsWith("org/matter/processed/")).toBeTrue();
    });

    it("keeps allowed characters: letters, numbers, dot, dash, underscore", () => {
      const key = buildStorageKey({
        organizationId: "org",
        matterId: "matter",
        scope: "thumbnail",
        filename: "Doc-01_v2.png",
      });
      expect(key).toMatch(/Doc-01_v2\.png$/);
    });

    it("produces a unique suffix per call", () => {
      const a = buildStorageKey({
        organizationId: "org",
        matterId: "matter",
        scope: "export",
        filename: "out.zip",
      });
      const b = buildStorageKey({
        organizationId: "org",
        matterId: "matter",
        scope: "export",
        filename: "out.zip",
      });
      expect(a).not.toBe(b);
    });
  });
});
