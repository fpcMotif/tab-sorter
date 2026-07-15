import { describe, expect, it } from "vitest";

import { toggleCaseFlag } from "./pattern-panel";

describe("toggleCaseFlag", () => {
  it("adds the case-insensitive flag when absent", () => {
    expect(toggleCaseFlag("")).toBe("i");
    expect(toggleCaseFlag("m")).toBe("mi");
  });

  it("removes only the `i`, preserving a preset's other flags", () => {
    expect(toggleCaseFlag("i")).toBe("");
    expect(toggleCaseFlag("im")).toBe("m");
    expect(toggleCaseFlag("mi")).toBe("m");
  });

  it("round-trips an i-free flag set back to itself", () => {
    for (const flags of ["", "m", "s", "ms"]) {
      expect(toggleCaseFlag(toggleCaseFlag(flags))).toBe(flags);
    }
  });
});
