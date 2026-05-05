import { buildStorageKey } from "@/lib/tokens";

/**
 * Pen-test the storage-key builder for path-traversal escapes. The function
 * already has happy-path coverage in `tokens.spec.ts`; here we focus on
 * adversarial filenames that try to break out of the per-org/per-matter
 * prefix in object storage.
 *
 * The contract we enforce:
 *   - Result is always exactly 4 slash-separated components beyond the
 *     `<org>/<matter>/<scope>/` prefix becomes ONE filename segment.
 *   - The user-supplied filename never widens the path.
 *   - No literal `..` substring survives, even from `....`, `..\\..`, etc.
 */
describe("security: storage key path-traversal", () => {
  function expectSafe(filename: string) {
    const key = buildStorageKey({
      organizationId: "org_x",
      matterId: "matter_y",
      scope: "original",
      filename,
    });
    expect(key.startsWith("org_x/matter_y/original/")).toBeTrue();
    // Exactly one slash-separated segment after the prefix: the storage
    // layer can never see additional `/` from user input.
    const tail = key.slice("org_x/matter_y/original/".length);
    expect(tail).not.toContain("/");
    expect(tail).not.toContain("\\");
    expect(tail).not.toContain("..");
    expect(tail).not.toContain("\u0000");
    return key;
  }

  describe("classic path-traversal payloads are neutralised", () => {
    const payloads = [
      "../../etc/passwd",
      "..\\..\\windows\\system32\\config",
      "....//....//etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "..%252F..%252Fetc%252Fpasswd",
      "/etc/passwd",
      "\\\\server\\share\\file.pdf",
      "C:\\Windows\\System32\\drivers\\etc\\hosts",
      "%00../../etc/passwd",
      "passport.pdf\u0000.exe",
      "passport.pdf\n../../etc/passwd",
      "passport.pdf\r\n../../etc/passwd",
    ];
    for (const filename of payloads) {
      it(`neutralises ${JSON.stringify(filename)}`, () => {
        expectSafe(filename);
      });
    }
  });

  it("preserves the original extension after sanitization", () => {
    const key = buildStorageKey({
      organizationId: "o",
      matterId: "m",
      scope: "original",
      filename: "passport scan.pdf",
    });
    expect(key.endsWith(".pdf")).toBeTrue();
  });

  it("two distinct uploads of the same filename produce distinct keys", () => {
    const a = buildStorageKey({
      organizationId: "o",
      matterId: "m",
      scope: "original",
      filename: "passport.pdf",
    });
    const b = buildStorageKey({
      organizationId: "o",
      matterId: "m",
      scope: "original",
      filename: "passport.pdf",
    });
    expect(a).not.toBe(b);
  });

  it("very long filenames do not cause throws or escape the prefix", () => {
    const long = "a".repeat(2000) + ".pdf";
    const key = buildStorageKey({
      organizationId: "o",
      matterId: "m",
      scope: "original",
      filename: long,
    });
    expect(key.startsWith("o/m/original/")).toBeTrue();
    expect(key).not.toContain("..");
  });
});
