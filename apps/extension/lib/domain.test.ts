import { describe, expect, it } from "vitest";

import { assignColor, getDomain } from "./domain";
import { GROUP_COLORS } from "./types";

describe("getDomain", () => {
  it("normalizes http hosts and strips www", () => {
    expect(getDomain("https://www.github.com/foo")).toBe("github.com");
    expect(getDomain("http://WWW.Example.com")).toBe("example.com");
  });

  it("buckets browser and local schemes", () => {
    expect(getDomain("chrome://settings")).toBe("(chrome)");
    expect(getDomain("about:blank")).toBe("(about)");
    expect(getDomain("file:///tmp/x")).toBe("(file)");
    expect(getDomain("chrome-extension://abc/options.html")).toBe("(extension)");
  });

  it("does not throw for empty or malformed urls", () => {
    expect(getDomain("")).toBe("(unknown)");
    expect(getDomain("not a url")).toBe("(unknown)");
  });

  it("buckets hostless schemes by their protocol", () => {
    expect(getDomain("data:text/plain,hello")).toBe("(data)");
    expect(getDomain("mailto:user@example.com")).toBe("(mailto)");
  });

  it("strips a root-zone trailing dot and keeps short hosts literal", () => {
    expect(getDomain("https://example.com.")).toBe("example.com");
    expect(getDomain("https://www.example.com.")).toBe("example.com");
    // single-character host: the length guard short-circuits before slicing
    expect(getDomain("https://a")).toBe("a");
  });
});

describe("assignColor", () => {
  it("is stable across repeated calls for the same domain", () => {
    expect(assignColor("github.com")).toBe(assignColor("github.com"));
    expect(assignColor("example.com")).toBe(assignColor("example.com"));
  });

  it("returns one of the 9 GROUP_COLORS and reaches all of them over many domains", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 200; i += 1) {
      const color = assignColor(`site${i}.example.com`);
      expect(GROUP_COLORS).toContain(color);
      seen.add(color);
    }

    expect(seen.size).toBe(GROUP_COLORS.length);
  });
});
