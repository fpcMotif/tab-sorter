import { describe, expect, it } from "vitest";

import { encodeHtml, indent, sentenceCase } from "@/lib/copy/string.ts";

describe("sentenceCase", () => {
  it("returns empty string for empty / undefined input", () => {
    // donor: `if (!text) return ''`
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase(undefined)).toBe("");
  });

  it("upper-cases the first character and leaves the rest untouched", () => {
    // donor: `${text[0].toLocaleUpperCase()}${text.substring(1)}`
    expect(sentenceCase("hello world")).toBe("Hello world");
    expect(sentenceCase("a")).toBe("A");
  });

  it("does not lower-case the remaining characters", () => {
    expect(sentenceCase("hELLO")).toBe("HELLO");
  });
});

describe("indent", () => {
  it("prefixes every line with 2 spaces by default", () => {
    // donor: `text.replace(/^/gm, ' '.repeat(indent))`, default indent = 2
    expect(indent("a\nb")).toBe("  a\n  b");
  });

  it("indents a blank line too (^ matches start of every line)", () => {
    expect(indent("a\n\nb")).toBe("  a\n  \n  b");
  });

  it("respects a custom indent width", () => {
    expect(indent("x", 4)).toBe("    x");
  });
});

describe("encodeHtml", () => {
  it("escapes & < > ' and \" in that order", () => {
    // donor order: & -> &amp;, < -> &lt;, > -> &gt;, ' -> &#39;, " -> &#34;
    expect(encodeHtml(`<a href="x" title='y'>&z</a>`)).toBe(
      "&lt;a href=&#34;x&#34; title=&#39;y&#39;&gt;&amp;z&lt;/a&gt;",
    );
  });

  it("escapes ampersand first so existing entities are double-encoded", () => {
    // donor replaces & before < , so &lt; in input becomes &amp;lt;
    expect(encodeHtml("&lt;")).toBe("&amp;lt;");
  });
});
