import { describe, expect, it } from "vitest";

import { getDomain, getDomainForTab } from "../domain.ts";

describe("getDomain", () => {
  it("extracts host from a normal HTTPS URL", () => {
    expect(getDomain("https://www.example.com/path?q=1")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(getDomain("https://www.github.com/login")).toBe("github.com");
    expect(getDomain("https://github.com/login")).toBe("github.com");
  });

  it("handles subdomains", () => {
    expect(getDomain("https://docs.github.com/pages")).toBe("docs.github.com");
  });

  it("returns scheme bucket for chrome:// URLs", () => {
    expect(getDomain("chrome://extensions")).toBe("(chrome)");
  });

  it("returns scheme bucket for about: URLs", () => {
    expect(getDomain("about:blank")).toBe("(about)");
  });

  it("returns scheme bucket for file:// URLs", () => {
    expect(getDomain("file:///C:/Users/me/doc.pdf")).toBe("(file)");
  });

  it("returns extension bucket for extension pages", () => {
    expect(getDomain("extension://abc123/popup.html")).toBe("(extension)");
  });

  it("returns scheme bucket for data: URLs", () => {
    expect(getDomain("data:text/html,<h1>hi</h1>")).toBe("(data)");
  });

  it("returns scheme bucket for javascript: URLs", () => {
    expect(getDomain("javascript:alert(1)")).toBe("(javascript)");
  });

  it("is case-insensitive for hostnames", () => {
    expect(getDomain("https://EXAMPLE.COM")).toBe("example.com");
  });

  it("returns empty bucket for missing URL", () => {
    expect(getDomain("")).toBe("(empty)");
  });

  it("returns invalid bucket for malformed URL", () => {
    expect(getDomain("not a url")).toBe("(invalid)");
  });

  it("handles URL with port", () => {
    expect(getDomain("http://localhost:3000/api")).toBe("localhost");
  });
});

describe("getDomainForTab", () => {
  it("delegates to getDomain", () => {
    expect(getDomainForTab({ url: "https://www.google.com" })).toBe("google.com");
  });
});
