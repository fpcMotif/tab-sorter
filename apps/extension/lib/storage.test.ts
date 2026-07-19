import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commitPrefsPatch, getPrefs, onPrefsChanged } from "./storage";
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
    await commitPrefsPatch({ defaultSort: "domain" });
    await commitPrefsPatch({ regexPresets: [{ label: "Docs", source: "docs", flags: "i" }] });

    await expect(getPrefs()).resolves.toEqual({
      ...DEFAULT_PREFS,
      defaultSort: "domain",
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
    });
  });

  it("round-trips stored values", async () => {
    const prefs = await commitPrefsPatch({ defaultSort: "domain", ignorePinned: false });

    expect(prefs.defaultSort).toBe("domain");
    await expect(getPrefs()).resolves.toMatchObject({ defaultSort: "domain", ignorePinned: false });
  });

  it("serializes concurrent disjoint patches so neither write is lost", async () => {
    await Promise.all([
      commitPrefsPatch({ defaultSort: "domain" }),
      commitPrefsPatch({ ignorePinned: false }),
    ]);

    await expect(getPrefs()).resolves.toMatchObject({
      defaultSort: "domain",
      ignorePinned: false,
    });
  });

  it("rejects an invalid patch without changing stored prefs", async () => {
    await commitPrefsPatch({ defaultSort: "domain" });

    await expect(commitPrefsPatch({ minGroupSize: 1 })).rejects.toMatchObject({
      message: "invalid prefs patch",
      code: "INVALID_REQUEST",
    });
    await expect(getPrefs()).resolves.toMatchObject({
      defaultSort: "domain",
      minGroupSize: DEFAULT_PREFS.minGroupSize,
    });
  });

  it("continues the writer queue after a rejected patch", async () => {
    await expect(commitPrefsPatch({ minGroupSize: 1 })).rejects.toThrow("invalid prefs patch");

    await expect(commitPrefsPatch({ ignorePinned: false })).resolves.toMatchObject({
      ignorePinned: false,
    });
  });

  it("accepts every preference in one strict patch", async () => {
    const patch = {
      defaultSort: "domain" as const,
      ignorePinned: false,
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
      collapseAfterTidy: true,
      minGroupSize: 99,
      groupOrder: "sizeDesc" as const,
      regroupExisting: true,
      dedupeIgnoreHash: false,
      dedupeIgnoreQuery: true,
    };

    await expect(commitPrefsPatch(patch)).resolves.toEqual(patch);
    await expect(getPrefs()).resolves.toEqual(patch);
  });

  it.each([
    ["a primitive", "prefs"],
    ["null", null],
    ["an array", []],
    ["an unknown key", { surprise: true }],
    ["an invalid sort mode", { defaultSort: "sideways" }],
    ["an invalid pinned flag", { ignorePinned: "false" }],
    ["a non-array preset list", { regexPresets: "docs" }],
    ["an invalid preset", { regexPresets: [{ label: "Docs", source: "docs" }] }],
    ["an invalid collapse flag", { collapseAfterTidy: 1 }],
    ["an invalid group order", { groupOrder: "largest" }],
    ["an invalid regroup flag", { regroupExisting: "true" }],
    ["an invalid hash flag", { dedupeIgnoreHash: 0 }],
    ["an invalid query flag", { dedupeIgnoreQuery: null }],
  ])("rejects %s", async (_description, patch) => {
    await expect(commitPrefsPatch(patch)).rejects.toMatchObject({
      message: "invalid prefs patch",
      code: "INVALID_REQUEST",
    });
  });

  it("continues the writer queue after storage rejects a write", async () => {
    const set = vi.spyOn(fakeBrowser.storage.sync, "set");
    set.mockRejectedValueOnce(new Error("sync quota exceeded"));

    await expect(commitPrefsPatch({ defaultSort: "domain" })).rejects.toThrow(
      "sync quota exceeded",
    );

    set.mockRestore();

    await expect(commitPrefsPatch({ ignorePinned: false })).resolves.toMatchObject({
      ignorePinned: false,
    });
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
