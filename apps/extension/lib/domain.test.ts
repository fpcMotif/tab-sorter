import { describe, expect, it } from "vitest";

import { getDomain } from "./domain";

describe("getDomain", () => {
  it("normalizes ordinary web URLs", () => {
    expect(getDomain("https://www.Example.com/docs?a=1")).toBe("example.com");
    expect(getDomain("http://sub.example.com/page")).toBe("sub.example.com");
  });

  it("buckets special browser schemes", () => {
    expect(getDomain("chrome://extensions")).toBe("(chrome)");
    expect(getDomain("about:blank")).toBe("(about)");
    expect(getDomain("file:///C:/tmp/example.html")).toBe("(file)");
    expect(getDomain("chrome-extension://abc/options.html")).toBe("(extension)");
  });

  it("returns a stable fallback for malformed or empty URLs", () => {
    expect(getDomain("")).toBe("(unknown)");
    expect(getDomain("not a url")).toBe("(unknown)");
  });
});
