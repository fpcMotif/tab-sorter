import { describe, expect, it } from "bun:test";
import { slugify } from "../index";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Tab Sorter!!--  ")).toBe("tab-sorter");
  });
});
