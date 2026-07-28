import { describe, expect, it } from "vitest";
import { compareText } from "./text";

describe("compareText", () => {
  it("sorts strings alphabetically", () => {
    expect(compareText("apple", "banana")).toBeLessThan(0);
    expect(compareText("banana", "apple")).toBeGreaterThan(0);
    expect(compareText("apple", "apple")).toBe(0);
  });

  it("handles numeric sorting correctly", () => {
    // "tab 2" should come before "tab 10"
    expect(compareText("tab 2", "tab 10")).toBeLessThan(0);
    expect(compareText("tab 10", "tab 2")).toBeGreaterThan(0);

    expect(compareText("2", "10")).toBeLessThan(0);
    expect(compareText("10", "2")).toBeGreaterThan(0);
  });

  it("is case-insensitive (sensitivity: 'base')", () => {
    expect(compareText("Apple", "apple")).toBe(0);
    expect(compareText("apple", "Apple")).toBe(0);

    expect(compareText("banana", "Apple")).toBeGreaterThan(0);
    expect(compareText("Apple", "banana")).toBeLessThan(0);
  });

  it("ignores diacritics (sensitivity: 'base')", () => {
    expect(compareText("résumé", "resume")).toBe(0);
    expect(compareText("resume", "résumé")).toBe(0);

    expect(compareText("jalapeño", "jalapeno")).toBe(0);
  });
});
