import { describe, expect, it } from "vitest";

import { GROUP_COLORS, type GroupColor } from "../types";

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
