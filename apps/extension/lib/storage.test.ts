import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPrefs,
  MAX_PRESET_LABEL_LENGTH,
  MAX_PRESET_SOURCE_LENGTH,
  MAX_PRESETS,
  MIN_GROUP_SIZE_CEIL,
  MIN_GROUP_SIZE_FLOOR,
  onPrefsChanged,
  parseMinGroupSize,
  setPrefs,
  validatePreset,
} from "./storage";
import { DEFAULT_PREFS } from "./types";

describe("prefs storage", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("browser", fakeBrowser);
  });

  it("returns defaults when storage is empty", async () => {
    await expect(getPrefs()).resolves.toEqual(DEFAULT_PREFS);
  });

  it("merges partial updates", async () => {
    await setPrefs({ defaultSort: "domain" });
    await setPrefs({ regexPresets: [{ label: "Docs", source: "docs", flags: "i" }] });

    await expect(getPrefs()).resolves.toEqual({
      ...DEFAULT_PREFS,
      defaultSort: "domain",
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
    });
  });

  it("round-trips stored values", async () => {
    const prefs = await setPrefs({ defaultSort: "domain", ignorePinned: false });

    expect(prefs.defaultSort).toBe("domain");
    await expect(getPrefs()).resolves.toMatchObject({ defaultSort: "domain", ignorePinned: false });
  });

  it("falls back to defaults and drops malformed presets from untrusted storage", async () => {
    await fakeBrowser.storage.sync.set({
      prefs: {
        defaultSort: "sideways",
        ignorePinned: "yes",
        regexPresets: [
          "not-an-object",
          null,
          { label: 1, source: "x", flags: "i" },
          { label: "no-flags", source: "x" },
          { label: "Docs", source: "docs", flags: "i" },
        ],
      },
    });

    await expect(getPrefs()).resolves.toEqual({
      ...DEFAULT_PREFS,
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
    });
  });

  it("ignores a non-array preset list", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { regexPresets: "nope" } });

    await expect(getPrefs()).resolves.toEqual(DEFAULT_PREFS);
  });

  it("accepts valid collapseAfterTidy and rejects non-booleans", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { collapseAfterTidy: true } });
    await expect(getPrefs()).resolves.toMatchObject({ collapseAfterTidy: true });

    await fakeBrowser.storage.sync.set({ prefs: { collapseAfterTidy: false } });
    await expect(getPrefs()).resolves.toMatchObject({ collapseAfterTidy: false });

    await fakeBrowser.storage.sync.set({ prefs: { collapseAfterTidy: "yes" } });
    await expect(getPrefs()).resolves.toMatchObject({
      collapseAfterTidy: DEFAULT_PREFS.collapseAfterTidy,
    });

    await fakeBrowser.storage.sync.set({ prefs: { collapseAfterTidy: 1 } });
    await expect(getPrefs()).resolves.toMatchObject({
      collapseAfterTidy: DEFAULT_PREFS.collapseAfterTidy,
    });
  });

  it("validates minGroupSize boundaries: accepts 2 and 99, rejects 1 (a group of one), 0, negatives, >99, non-integers", async () => {
    // A floor of 1 would let a domain with exactly one tab form its own
    // "group" — the noise minGroupSize's doc comment says it exists to avoid.
    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 1 } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 99 } });
    await expect(getPrefs()).resolves.toMatchObject({ minGroupSize: 99 });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 2 } });
    await expect(getPrefs()).resolves.toMatchObject({ minGroupSize: 2 });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 0 } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: -5 } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 100 } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: 2.5 } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });

    await fakeBrowser.storage.sync.set({ prefs: { minGroupSize: "2" } });
    await expect(getPrefs()).resolves.toMatchObject({
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });
  });

  it("accepts valid groupOrder and rejects unknown strings", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { groupOrder: "alpha" } });
    await expect(getPrefs()).resolves.toMatchObject({ groupOrder: "alpha" });

    await fakeBrowser.storage.sync.set({ prefs: { groupOrder: "sizeDesc" } });
    await expect(getPrefs()).resolves.toMatchObject({ groupOrder: "sizeDesc" });

    await fakeBrowser.storage.sync.set({ prefs: { groupOrder: "invalid" } });
    await expect(getPrefs()).resolves.toMatchObject({
      groupOrder: DEFAULT_PREFS.groupOrder,
    });

    await fakeBrowser.storage.sync.set({ prefs: { groupOrder: 123 } });
    await expect(getPrefs()).resolves.toMatchObject({
      groupOrder: DEFAULT_PREFS.groupOrder,
    });

    await fakeBrowser.storage.sync.set({ prefs: { groupOrder: null } });
    await expect(getPrefs()).resolves.toMatchObject({
      groupOrder: DEFAULT_PREFS.groupOrder,
    });
  });

  it("accepts valid regroupExisting and rejects non-booleans", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { regroupExisting: true } });
    await expect(getPrefs()).resolves.toMatchObject({ regroupExisting: true });

    await fakeBrowser.storage.sync.set({ prefs: { regroupExisting: false } });
    await expect(getPrefs()).resolves.toMatchObject({ regroupExisting: false });

    await fakeBrowser.storage.sync.set({ prefs: { regroupExisting: "true" } });
    await expect(getPrefs()).resolves.toMatchObject({
      regroupExisting: DEFAULT_PREFS.regroupExisting,
    });
  });

  it("accepts valid dedupeIgnoreHash and rejects non-booleans", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreHash: false } });
    await expect(getPrefs()).resolves.toMatchObject({ dedupeIgnoreHash: false });

    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreHash: true } });
    await expect(getPrefs()).resolves.toMatchObject({ dedupeIgnoreHash: true });

    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreHash: 0 } });
    await expect(getPrefs()).resolves.toMatchObject({
      dedupeIgnoreHash: DEFAULT_PREFS.dedupeIgnoreHash,
    });
  });

  it("accepts valid dedupeIgnoreQuery and rejects non-booleans", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreQuery: true } });
    await expect(getPrefs()).resolves.toMatchObject({ dedupeIgnoreQuery: true });

    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreQuery: false } });
    await expect(getPrefs()).resolves.toMatchObject({ dedupeIgnoreQuery: false });

    await fakeBrowser.storage.sync.set({ prefs: { dedupeIgnoreQuery: null } });
    await expect(getPrefs()).resolves.toMatchObject({
      dedupeIgnoreQuery: DEFAULT_PREFS.dedupeIgnoreQuery,
    });
  });
});

describe("onPrefsChanged", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("browser", fakeBrowser);
  });

  it("invokes the callback with normalized prefs on a sync-area prefs change", async () => {
    const cb = vi.fn();
    onPrefsChanged(cb);

    await fakeBrowser.storage.sync.set({ prefs: { defaultSort: "domain" } });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ ...DEFAULT_PREFS, defaultSort: "domain" });
  });

  it("ignores local-area writes and writes to other keys", async () => {
    const cb = vi.fn();
    onPrefsChanged(cb);

    await fakeBrowser.storage.local.set({ prefs: { defaultSort: "domain" } });
    await fakeBrowser.storage.sync.set({ other: "value" });

    expect(cb).not.toHaveBeenCalled();
  });

  it("stops delivering once unsubscribed", async () => {
    const cb = vi.fn();
    const unsubscribe = onPrefsChanged(cb);

    unsubscribe();
    await fakeBrowser.storage.sync.set({ prefs: { defaultSort: "domain" } });

    expect(cb).not.toHaveBeenCalled();
  });

  it("normalizes a corrupt stored value down to defaults through the callback", async () => {
    const cb = vi.fn();
    onPrefsChanged(cb);

    await fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "sideways", minGroupSize: 0, regexPresets: "nope" },
    });

    expect(cb).toHaveBeenCalledWith(DEFAULT_PREFS);
  });
});

describe("parseMinGroupSize", () => {
  it("accepts the floor and ceiling as bare integers", () => {
    expect(parseMinGroupSize(String(MIN_GROUP_SIZE_FLOOR))).toBe(MIN_GROUP_SIZE_FLOOR);
    expect(parseMinGroupSize(String(MIN_GROUP_SIZE_CEIL))).toBe(MIN_GROUP_SIZE_CEIL);
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseMinGroupSize(`  ${MIN_GROUP_SIZE_FLOOR}  `)).toBe(MIN_GROUP_SIZE_FLOOR);
  });

  it("rejects a value below the floor", () => {
    expect(parseMinGroupSize(String(MIN_GROUP_SIZE_FLOOR - 1))).toBeUndefined();
  });

  it("rejects a value above the ceiling", () => {
    expect(parseMinGroupSize(String(MIN_GROUP_SIZE_CEIL + 1))).toBeUndefined();
  });

  it("rejects non-digit input: empty, decimals, negatives, and non-numeric text", () => {
    expect(parseMinGroupSize("")).toBeUndefined();
    expect(parseMinGroupSize("2.5")).toBeUndefined();
    expect(parseMinGroupSize("-5")).toBeUndefined();
    expect(parseMinGroupSize("abc")).toBeUndefined();
  });
});

describe("validatePreset", () => {
  const draft = { label: "Docs", source: "docs", flags: "i" };

  it("requires a non-blank label", () => {
    expect(validatePreset({ ...draft, label: "" }, 0)).toBe("Preset label is required.");
    expect(validatePreset({ ...draft, label: "   " }, 0)).toBe("Preset label is required.");
  });

  it("rejects a label over the max length", () => {
    const message = validatePreset({ ...draft, label: "x".repeat(MAX_PRESET_LABEL_LENGTH + 1) }, 0);

    expect(message).toBe(`Label is too long (max ${MAX_PRESET_LABEL_LENGTH} characters).`);
  });

  it("requires a non-blank pattern", () => {
    expect(validatePreset({ ...draft, source: "" }, 0)).toBe("Pattern is required.");
    expect(validatePreset({ ...draft, source: "   " }, 0)).toBe("Pattern is required.");
  });

  // A 501-1000 char source is invalid regex-wise nowhere — it fails the
  // storage cap (500) before validatePattern's safety cap (1000) is ever
  // consulted, proving ADR-0001's ordering: the storage cap always fires first.
  it("rejects a pattern over the storage cap even though it's under the safety cap", () => {
    const overStorageCap = "a".repeat(MAX_PRESET_SOURCE_LENGTH + 1);
    const message = validatePreset({ ...draft, source: overStorageCap }, 0);

    expect(overStorageCap.length).toBeLessThan(1000);
    expect(message).toBe(`Pattern is too long (max ${MAX_PRESET_SOURCE_LENGTH} characters).`);
  });

  it("rejects a new preset once the preset limit is reached", () => {
    const message = validatePreset(draft, MAX_PRESETS);

    expect(message).toBe(`Preset limit reached (${MAX_PRESETS}). Delete one to add another.`);
  });

  it("rejects an invalid regex pattern via validatePattern", () => {
    const message = validatePreset({ ...draft, source: "(" }, 0);

    expect(message).toBe("Invalid regular expression.");
  });

  it("rejects invalid flags via validatePattern", () => {
    const message = validatePreset({ ...draft, flags: "z" }, 0);

    expect(message).toBe("Invalid regex flags.");
  });

  it("accepts a valid preset", () => {
    expect(validatePreset(draft, 0)).toBe("");
  });
});
