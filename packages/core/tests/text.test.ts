import { describe, expect, it } from "vitest";

import { compareText } from "../text";

describe("compareText", () => {
  it("orders distinct strings lexically, low-to-high", () => {
    expect(compareText("apple", "banana")).toBeLessThan(0);
    expect(compareText("banana", "apple")).toBeGreaterThan(0);
  });

  it("treats identical strings as equal", () => {
    expect(compareText("tab-sorter", "tab-sorter")).toBe(0);
  });

  // sensitivity: "base" — case differences alone don't distinguish strings.
  it("is case-insensitive", () => {
    expect(compareText("Apple", "apple")).toBe(0);
    expect(compareText("APPLE", "apple")).toBe(0);
  });

  // sensitivity: "base" — diacritic differences alone don't distinguish strings.
  it("is diacritic-insensitive", () => {
    expect(compareText("café", "cafe")).toBe(0);
    expect(compareText("resume", "résumé")).toBe(0);
  });

  // numeric: true — embedded digit runs compare by numeric value, not by
  // character code, so "tab2" sorts before "tab10".
  it("orders embedded numbers numerically, not lexically", () => {
    expect(compareText("tab2", "tab10")).toBeLessThan(0);
    expect(compareText("tab10", "tab2")).toBeGreaterThan(0);
    expect(compareText("tab9", "tab10")).toBeLessThan(0);
  });

  it("treats numerically-equal digit runs as equal even with different padding", () => {
    expect(compareText("tab02", "tab2")).toBe(0);
  });

  it("is antisymmetric: swapping arguments flips the sign", () => {
    const left = "domain-a.com";
    const right = "domain-b.com";

    expect(Math.sign(compareText(left, right))).toBe(-Math.sign(compareText(right, left)));
  });
});
