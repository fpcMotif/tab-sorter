import { describe, expect, it } from "vitest";

import { normalizePrefs } from "../prefs";
import { DEFAULT_PREFS } from "../types";

describe("DEFAULT_PREFS", () => {
  it("round-trips unchanged through normalizePrefs", () => {
    // normalizePrefs treats its input as untrusted storage and falls back to
    // DEFAULT_PREFS field-by-field on anything invalid. Feeding it
    // DEFAULT_PREFS itself must be a no-op — any drift here means a per-field
    // fallback in prefs.ts disagrees with the canonical default in types.ts.
    expect(normalizePrefs(DEFAULT_PREFS)).toEqual(DEFAULT_PREFS);
  });
});

describe("normalizePrefs — top-level shape", () => {
  it("falls back to defaults entirely for non-object or null input", () => {
    expect(normalizePrefs("prefs")).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(42)).toEqual(DEFAULT_PREFS);
  });

  it("treats an array as a fieldless object, so every field falls back", () => {
    expect(normalizePrefs([1, 2, 3])).toEqual(DEFAULT_PREFS);
  });

  it("falls back to defaults for an empty object", () => {
    expect(normalizePrefs({})).toEqual(DEFAULT_PREFS);
  });
});

describe("normalizePrefs — defaultSort", () => {
  it("accepts a valid sort mode and rejects an unknown one", () => {
    expect(normalizePrefs({ defaultSort: "domain" }).defaultSort).toBe("domain");
    expect(normalizePrefs({ defaultSort: "sideways" }).defaultSort).toBe(DEFAULT_PREFS.defaultSort);
  });
});

describe("normalizePrefs — ignorePinned", () => {
  it("accepts a boolean and rejects a non-boolean", () => {
    expect(normalizePrefs({ ignorePinned: false }).ignorePinned).toBe(false);
    expect(normalizePrefs({ ignorePinned: "false" }).ignorePinned).toBe(DEFAULT_PREFS.ignorePinned);
  });
});

describe("normalizePrefs — regexPresets", () => {
  it("ignores a non-array preset list", () => {
    expect(normalizePrefs({ regexPresets: "nope" }).regexPresets).toEqual(
      DEFAULT_PREFS.regexPresets,
    );
  });

  it("drops malformed presets and keeps the well-formed ones", () => {
    expect(
      normalizePrefs({
        regexPresets: [
          "not-an-object",
          null,
          { label: 1, source: "x", flags: "i" },
          { label: "x", source: 2, flags: "i" },
          { label: "no-flags", source: "x" },
          { label: "Docs", source: "docs", flags: "i" },
        ],
      }).regexPresets,
    ).toEqual([{ label: "Docs", source: "docs", flags: "i" }]);
  });
});

describe("normalizePrefs — collapseAfterTidy", () => {
  it("accepts both booleans and rejects non-booleans", () => {
    expect(normalizePrefs({ collapseAfterTidy: true }).collapseAfterTidy).toBe(true);
    expect(normalizePrefs({ collapseAfterTidy: false }).collapseAfterTidy).toBe(false);
    expect(normalizePrefs({ collapseAfterTidy: "yes" }).collapseAfterTidy).toBe(
      DEFAULT_PREFS.collapseAfterTidy,
    );
    expect(normalizePrefs({ collapseAfterTidy: 1 }).collapseAfterTidy).toBe(
      DEFAULT_PREFS.collapseAfterTidy,
    );
  });
});

describe("normalizePrefs — minGroupSize boundary", () => {
  // A floor of 1 would let a domain with exactly one tab form its own
  // "group" — the noise minGroupSize's doc comment says it exists to avoid.
  it("accepts 2 and 99, rejects 1, 0, negatives, >99, and non-integers", () => {
    expect(normalizePrefs({ minGroupSize: 2 }).minGroupSize).toBe(2);
    expect(normalizePrefs({ minGroupSize: 99 }).minGroupSize).toBe(99);

    expect(normalizePrefs({ minGroupSize: 1 }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
    expect(normalizePrefs({ minGroupSize: 0 }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
    expect(normalizePrefs({ minGroupSize: -5 }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
    expect(normalizePrefs({ minGroupSize: 100 }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
    expect(normalizePrefs({ minGroupSize: 2.5 }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
    expect(normalizePrefs({ minGroupSize: "2" }).minGroupSize).toBe(DEFAULT_PREFS.minGroupSize);
  });
});

describe("normalizePrefs — groupOrder", () => {
  it("accepts valid group orders and rejects unknown values", () => {
    expect(normalizePrefs({ groupOrder: "alpha" }).groupOrder).toBe("alpha");
    expect(normalizePrefs({ groupOrder: "sizeDesc" }).groupOrder).toBe("sizeDesc");

    expect(normalizePrefs({ groupOrder: "invalid" }).groupOrder).toBe(DEFAULT_PREFS.groupOrder);
    expect(normalizePrefs({ groupOrder: 123 }).groupOrder).toBe(DEFAULT_PREFS.groupOrder);
    expect(normalizePrefs({ groupOrder: null }).groupOrder).toBe(DEFAULT_PREFS.groupOrder);
  });
});

describe("normalizePrefs — regroupExisting", () => {
  it("accepts both booleans and rejects a non-boolean", () => {
    expect(normalizePrefs({ regroupExisting: true }).regroupExisting).toBe(true);
    expect(normalizePrefs({ regroupExisting: false }).regroupExisting).toBe(false);
    expect(normalizePrefs({ regroupExisting: "true" }).regroupExisting).toBe(
      DEFAULT_PREFS.regroupExisting,
    );
  });
});

describe("normalizePrefs — dedupeIgnoreHash", () => {
  it("accepts both booleans and rejects a non-boolean", () => {
    expect(normalizePrefs({ dedupeIgnoreHash: false }).dedupeIgnoreHash).toBe(false);
    expect(normalizePrefs({ dedupeIgnoreHash: true }).dedupeIgnoreHash).toBe(true);
    expect(normalizePrefs({ dedupeIgnoreHash: 0 }).dedupeIgnoreHash).toBe(
      DEFAULT_PREFS.dedupeIgnoreHash,
    );
  });
});

describe("normalizePrefs — dedupeIgnoreQuery", () => {
  it("accepts both booleans and rejects a non-boolean", () => {
    expect(normalizePrefs({ dedupeIgnoreQuery: true }).dedupeIgnoreQuery).toBe(true);
    expect(normalizePrefs({ dedupeIgnoreQuery: false }).dedupeIgnoreQuery).toBe(false);
    expect(normalizePrefs({ dedupeIgnoreQuery: null }).dedupeIgnoreQuery).toBe(
      DEFAULT_PREFS.dedupeIgnoreQuery,
    );
  });
});
