import {
  cn,
  formatBytes,
  formatDate,
  formatDateTime,
  initials,
  relativeTime,
  slugify,
  truncate,
} from "@/lib/utils";

describe("lib/utils", () => {
  describe("cn", () => {
    it("merges plain class names", () => {
      expect(cn("a", "b")).toBe("a b");
    });

    it("filters falsy values", () => {
      expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
    });

    it("dedupes conflicting tailwind utilities (later wins)", () => {
      expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("supports object + array inputs like clsx", () => {
      expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
    });
  });

  describe("formatBytes", () => {
    it("returns 0 B for zero, negative, NaN, or Infinity", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-10)).toBe("0 B");
      expect(formatBytes(Number.NaN)).toBe("0 B");
      expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
    });

    it("formats bytes / KB / MB / GB / TB correctly", () => {
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
      expect(formatBytes(1024 ** 4)).toBe("1 TB");
    });

    it("respects the decimals argument", () => {
      expect(formatBytes(1536, 0)).toBe("2 KB");
      expect(formatBytes(1536, 2)).toBe("1.5 KB");
    });

    it("caps unit selection at TB even for huge inputs", () => {
      expect(formatBytes(1024 ** 6)).toMatch(/TB$/);
    });
  });

  describe("formatDate / formatDateTime", () => {
    it("returns em-dash for null, undefined, empty, or invalid input", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
      expect(formatDate("not-a-date")).toBe("—");
      expect(formatDateTime(null)).toBe("—");
      expect(formatDateTime("nope")).toBe("—");
    });

    it("renders an ISO string as a US-style date", () => {
      const out = formatDate("2024-03-15T12:00:00Z");
      expect(out).toMatch(/Mar/);
      expect(out).toMatch(/2024/);
    });

    it("renders an ISO string as a date-time including the year", () => {
      const out = formatDateTime("2024-03-15T18:30:00Z");
      expect(out).toMatch(/2024/);
      expect(out).toMatch(/Mar/);
    });
  });

  describe("relativeTime", () => {
    let nowSpy: jasmine.Spy;

    function freezeNow(iso: string) {
      const t = new Date(iso).getTime();
      nowSpy = spyOn(Date, "now").and.returnValue(t);
    }

    it("returns em-dash for invalid input", () => {
      expect(relativeTime(null)).toBe("—");
      expect(relativeTime("nope")).toBe("—");
    });

    it("renders past values with the smallest sensible unit", () => {
      freezeNow("2024-01-01T12:00:00Z");
      expect(relativeTime("2024-01-01T11:59:30Z")).toBe("30s ago");
      expect(relativeTime("2024-01-01T11:30:00Z")).toBe("30m ago");
      expect(relativeTime("2024-01-01T09:00:00Z")).toBe("3h ago");
      expect(relativeTime("2023-12-30T12:00:00Z")).toBe("2d ago");
      expect(nowSpy).toHaveBeenCalled();
    });

    it("falls back to absolute date for values older than a week", () => {
      freezeNow("2024-01-31T12:00:00Z");
      const out = relativeTime("2024-01-01T12:00:00Z");
      expect(out).toMatch(/Jan/);
      expect(out).toMatch(/2024/);
    });

    it("treats values within ~5s of now as 'just now'", () => {
      freezeNow("2024-01-01T12:00:00Z");
      expect(relativeTime("2024-01-01T12:00:02Z")).toBe("just now");
    });

    it("renders future values symmetrically (in Xs / Xm / Xh)", () => {
      freezeNow("2024-01-01T12:00:00Z");
      expect(relativeTime("2024-01-01T12:00:30Z")).toBe("in 30s");
      expect(relativeTime("2024-01-01T12:30:00Z")).toBe("in 30m");
      expect(relativeTime("2024-01-01T15:00:00Z")).toBe("in 3h");
    });

    it("falls back to absolute date for far-future values", () => {
      freezeNow("2024-01-01T12:00:00Z");
      const out = relativeTime("2024-02-15T12:00:00Z");
      expect(out).toMatch(/Feb/);
    });
  });

  describe("initials", () => {
    it("returns ? for empty / nullish names", () => {
      expect(initials(null)).toBe("?");
      expect(initials(undefined)).toBe("?");
      expect(initials("")).toBe("?");
      expect(initials("   ")).toBe("?");
    });

    it("uses up to two leading initials", () => {
      expect(initials("Ada Lovelace")).toBe("AL");
      expect(initials("Alan Mathison Turing")).toBe("AM");
    });

    it("uppercases the result", () => {
      expect(initials("ada lovelace")).toBe("AL");
    });

    it("ignores extra whitespace between parts", () => {
      expect(initials("  Ada    Lovelace  ")).toBe("AL");
    });
  });

  describe("slugify", () => {
    it("lowercases, trims, and replaces whitespace with hyphens", () => {
      expect(slugify("  Hello World  ")).toBe("hello-world");
    });

    it("strips punctuation and collapses runs of hyphens", () => {
      expect(slugify("Smith & Jones, LLC!!")).toBe("smith-jones-llc");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugify("---weird---")).toBe("weird");
    });

    it("handles empty / pure-punctuation strings", () => {
      expect(slugify("")).toBe("");
      expect(slugify("!!!")).toBe("");
    });

    it("preserves digits and existing hyphens", () => {
      expect(slugify("Plan 2024 - Solo")).toBe("plan-2024-solo");
    });
  });

  describe("truncate", () => {
    it("returns the string unchanged when shorter than max", () => {
      expect(truncate("hello", 80)).toBe("hello");
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("truncates with an ellipsis when longer than max", () => {
      expect(truncate("hello world", 8)).toBe("hello w…");
      expect(truncate("hello world", 8).length).toBe(8);
    });

    it("returns empty string when max <= 0", () => {
      expect(truncate("hello", 0)).toBe("");
      expect(truncate("hello", -3)).toBe("");
    });

    it("returns just an ellipsis when max is 1 and input is longer", () => {
      expect(truncate("hello", 1)).toBe("…");
    });
  });
});
