import { describe, expect, it } from "vitest";

import { normalizePrefs } from "./storage";
import { DEFAULT_PREFS, GROUP_COLORS, type GroupColor } from "./types";

describe("DEFAULT_PREFS", () => {
  it("round-trips unchanged through storage's normalizePrefs", () => {
    // normalizePrefs treats its input as untrusted storage and falls back to
    // DEFAULT_PREFS field-by-field on anything invalid. Feeding it
    // DEFAULT_PREFS itself must be a no-op — any drift here means a per-field
    // fallback in storage.ts disagrees with the canonical default in types.ts.
    expect(normalizePrefs(DEFAULT_PREFS)).toEqual(DEFAULT_PREFS);
  });
});

describe("GROUP_COLORS", () => {
  // Every key must be present for this object literal to typecheck against
  // Record<GroupColor, true> — add or remove a GroupColor union member
  // without updating this list and the suite fails to compile.
  const exhaustiveColors: Record<GroupColor, true> = {
    grey: true,
    blue: true,
    red: true,
    yellow: true,
    green: true,
    pink: true,
    purple: true,
    cyan: true,
    orange: true,
  };

  it("covers exactly the GroupColor union: length, uniqueness, and membership", () => {
    const expectedMembers = Object.keys(exhaustiveColors).toSorted();

    expect(new Set(GROUP_COLORS).size).toBe(GROUP_COLORS.length);
    expect(GROUP_COLORS.length).toBe(expectedMembers.length);
    expect([...GROUP_COLORS].toSorted()).toEqual(expectedMembers);
  });
});
