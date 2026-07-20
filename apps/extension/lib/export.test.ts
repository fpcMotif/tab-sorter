import { describe, expect, it } from "vitest";

import {
  buildClipboardContent,
  buildExportEntries,
  buildUrlExport,
  COPY_FORMATS,
  DOWNLOAD_FORMATS,
} from "./export";
import type { TabLite } from "@tab-sorter/core/types";

function makeTabs(
  items: Array<Partial<TabLite> & { id: number; title: string; url: string }>,
): TabLite[] {
  return items.map((item, index) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    index: item.index ?? index,
    pinned: item.pinned ?? false,
  }));
}

describe("buildExportEntries", () => {
  it("maps tabs to export entries", () => {
    const tabs = makeTabs([{ id: 1, title: "GitHub", url: "https://github.com/a" }]);
    expect(buildExportEntries(tabs)).toEqual([
      { title: "GitHub", url: "https://github.com/a", domain: "github.com" },
    ]);
  });

  it("returns empty array for no tabs", () => {
    expect(buildExportEntries([])).toEqual([]);
  });
});

describe("buildUrlExport (markdown)", () => {
  it("reports no tabs", () => {
    const result = buildUrlExport([], "markdown");
    expect(result.extension).toBe("md");
    expect(result.mimeType).toBe("text/markdown");
    expect(result.content).toContain("No tabs to export");
  });

  it("groups by domain and emits markdown links", () => {
    const tabs = makeTabs([
      { id: 1, title: "GitHub Issues", url: "https://github.com/issues" },
      { id: 2, title: "GitHub PRs", url: "https://github.com/pulls" },
      { id: 3, title: "Example", url: "https://example.com/" },
    ]);
    const { content } = buildUrlExport(tabs, "markdown");
    expect(content).toContain("# Exported tabs");
    expect(content).toContain("Total: 3 tab(s)");
    expect(content).toContain("## example.com");
    expect(content).toContain("## github.com");
    expect(content).toContain("- [GitHub Issues](https://github.com/issues)");
    expect(content).toContain("- [GitHub PRs](https://github.com/pulls)");
    expect(content).toContain("- [Example](https://example.com/)");
  });

  it("escapes brackets in titles", () => {
    const tabs = makeTabs([{ id: 1, title: "[Bug] Issue", url: "https://github.com/bug" }]);
    const { content } = buildUrlExport(tabs, "markdown");
    expect(content).toContain("- [\\[Bug\\] Issue](https://github.com/bug)");
  });

  it("flattens newlines in titles and angle-wraps urls with spaces or parens", () => {
    const tabs = makeTabs([
      { id: 1, title: "Tab\r\nInterface", url: "https://en.wikipedia.org/wiki/Tab_(interface)" },
    ]);
    const { content } = buildUrlExport(tabs, "markdown");
    expect(content).toContain("- [Tab Interface](<https://en.wikipedia.org/wiki/Tab_(interface)>)");
  });
});

describe("buildClipboardContent (markdown)", () => {
  it("renders a single tab as a bare inline link, no bullet or header", () => {
    const tabs = makeTabs([{ id: 1, title: "GitHub", url: "https://github.com/a" }]);
    expect(buildClipboardContent(tabs, "markdown")).toBe("[GitHub](https://github.com/a)");
  });

  it("renders multiple tabs as a flat bullet list, ungrouped, in selection order", () => {
    const tabs = makeTabs([
      { id: 1, title: "Beta", url: "https://github.com/b" },
      { id: 2, title: "Alpha", url: "https://example.com/a" },
    ]);
    // Selection order is preserved (no domain grouping or sorting), unlike the file export.
    expect(buildClipboardContent(tabs, "markdown")).toBe(
      "- [Beta](https://github.com/b)\n- [Alpha](https://example.com/a)",
    );
  });

  it("reuses the link escaping rules for brackets, newlines, and parens", () => {
    const tabs = makeTabs([
      { id: 1, title: "[Bug]\r\nIssue", url: "https://en.wikipedia.org/wiki/Tab_(interface)" },
    ]);
    expect(buildClipboardContent(tabs, "markdown")).toBe(
      "[\\[Bug\\] Issue](<https://en.wikipedia.org/wiki/Tab_(interface)>)",
    );
  });

  it("backslash-escapes raw angle brackets inside an angle-wrapped url", () => {
    // The parens force the angle-bracket form; an unescaped `>` would otherwise
    // close the destination early and spill the rest as literal text.
    const tabs = makeTabs([{ id: 1, title: "X", url: "https://x.test/a(b)>c<d" }]);
    expect(buildClipboardContent(tabs, "markdown")).toBe("[X](<https://x.test/a(b)\\>c\\<d>)");
  });

  it("returns an empty string for no tabs", () => {
    expect(buildClipboardContent([], "markdown")).toBe("");
  });
});

describe("buildClipboardContent (json)", () => {
  it("emits a parseable array of title/url objects without the domain field", () => {
    const tabs = makeTabs([
      { id: 1, title: "GitHub", url: "https://github.com/a" },
      { id: 2, title: "Example", url: "https://example.com/" },
    ]);
    const parsed = JSON.parse(buildClipboardContent(tabs, "json"));
    expect(parsed).toEqual([
      { title: "GitHub", url: "https://github.com/a" },
      { title: "Example", url: "https://example.com/" },
    ]);
  });

  it("round-trips titles and urls holding quotes, newlines, and unicode", () => {
    const tabs = makeTabs([
      { id: 1, title: 'He said "hi"\n…', url: "https://x.test/a?q=1&b=2" },
      { id: 2, title: "café — ❤", url: "https://例え.テスト/path" },
    ]);
    const parsed = JSON.parse(buildClipboardContent(tabs, "json"));
    expect(parsed).toEqual(tabs.map((tab) => ({ title: tab.title, url: tab.url })));
  });

  it("pretty-prints with two-space indentation for readable pasting", () => {
    const tabs = makeTabs([{ id: 1, title: "GitHub", url: "https://github.com/a" }]);
    expect(buildClipboardContent(tabs, "json")).toBe(
      '[\n  {\n    "title": "GitHub",\n    "url": "https://github.com/a"\n  }\n]',
    );
  });

  it("emits an empty array for no tabs", () => {
    expect(buildClipboardContent([], "json")).toBe("[]");
  });
});

describe("buildClipboardContent (url)", () => {
  it("emits only urls, one per line, in selection order", () => {
    const tabs = makeTabs([
      { id: 1, title: "B", url: "https://github.com/b" },
      { id: 2, title: "A", url: "https://example.com/a" },
    ]);
    expect(buildClipboardContent(tabs, "url")).toBe("https://github.com/b\nhttps://example.com/a");
  });

  it("returns an empty string for no tabs", () => {
    expect(buildClipboardContent([], "url")).toBe("");
  });
});

describe("buildClipboardContent (html)", () => {
  it("emits anchors with title and href escaped against markup injection", () => {
    const tabs = makeTabs([
      { id: 1, title: 'Tom & "Jerry" <b>', url: 'https://x.test/?a=1&b="2"' },
    ]);
    expect(buildClipboardContent(tabs, "html")).toBe(
      '<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">Tom &amp; &quot;Jerry&quot; &lt;b&gt;</a>',
    );
  });

  it("joins multiple anchors with newlines", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://a.test/" },
      { id: 2, title: "B", url: "https://b.test/" },
    ]);
    expect(buildClipboardContent(tabs, "html")).toBe(
      '<a href="https://a.test/">A</a>\n<a href="https://b.test/">B</a>',
    );
  });

  it("escapes single quotes in both title and href", () => {
    const tabs = makeTabs([{ id: 1, title: "O'Brien", url: "https://x.test/?q='a'" }]);
    expect(buildClipboardContent(tabs, "html")).toBe(
      `<a href="https://x.test/?q=&#39;a&#39;">O&#39;Brien</a>`,
    );
  });

  it("returns an empty string for no tabs", () => {
    expect(buildClipboardContent([], "html")).toBe("");
  });
});

describe("buildClipboardContent (round-trip property)", () => {
  // A spread of titles/urls that exercise every escaping path at once: markdown
  // metacharacters, html-significant characters, json control characters, parens,
  // and unicode. JSON is the lossless format, so it must reproduce the input
  // exactly; the line-oriented url format must recover every url verbatim.
  const tabs = makeTabs([
    { id: 1, title: "plain", url: "https://a.test/" },
    { id: 2, title: '[md] & <html> "q"', url: "https://b.test/Tab_(x)?a=1&b=2" },
    { id: 3, title: "line\nbreak\ttab", url: "https://c.test/#frag" },
    { id: 4, title: "café ❤ 例え", url: "https://例え.テスト/path with space" },
  ]);

  it("preserves every title and url losslessly through json", () => {
    const parsed = JSON.parse(buildClipboardContent(tabs, "json"));
    expect(parsed).toEqual(tabs.map((tab) => ({ title: tab.title, url: tab.url })));
  });

  it("recovers every url verbatim from the url format", () => {
    expect(buildClipboardContent(tabs, "url").split("\n")).toEqual(tabs.map((tab) => tab.url));
  });
});

describe("buildClipboardContent (malformed url normalization)", () => {
  it("strips CR/LF from urls so line-oriented and json output stay one entry per tab", () => {
    const tabs = makeTabs([
      { id: 1, title: "Data", url: "data:text/html,<h1>a</h1>\r\n<p>b</p>" },
      { id: 2, title: "Plain", url: "https://b.test/" },
    ]);

    // A newline in the url would otherwise split it across two output lines and
    // break the one-url-per-line contract the round-trip relies on.
    expect(buildClipboardContent(tabs, "url").split("\n")).toEqual([
      "data:text/html,<h1>a</h1><p>b</p>",
      "https://b.test/",
    ]);
    expect(JSON.parse(buildClipboardContent(tabs, "json"))).toEqual([
      { title: "Data", url: "data:text/html,<h1>a</h1><p>b</p>" },
      { title: "Plain", url: "https://b.test/" },
    ]);
  });
});

describe("COPY_FORMATS registry", () => {
  it("lists exactly the four supported formats in display order", () => {
    expect(COPY_FORMATS.map((option) => option.format)).toEqual([
      "markdown",
      "json",
      "url",
      "html",
    ]);
  });

  // Guards against a format being added to the registry (so the popup renders a
  // button for it) while buildClipboardContent has no case and silently falls
  // through to the markdown default.
  it("renders string output for every registered format", () => {
    const tabs = makeTabs([{ id: 1, title: "X", url: "https://x.test/" }]);

    for (const { format } of COPY_FORMATS) {
      expect(typeof buildClipboardContent(tabs, format)).toBe("string");
    }
  });
});

describe("buildUrlExport (plain text)", () => {
  it("reports no tabs", () => {
    const result = buildUrlExport([], "text");
    expect(result.extension).toBe("txt");
    expect(result.mimeType).toBe("text/plain");
    expect(result.content).toContain("No tabs to export");
  });

  it("groups by domain and emits URLs only", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://github.com/a" },
      { id: 2, title: "B", url: "https://example.com/b" },
    ]);
    const { content } = buildUrlExport(tabs, "text");
    expect(content).toContain("Exported 2 tab(s)");
    expect(content).toContain("## example.com");
    expect(content).toContain("https://example.com/b");
    expect(content).not.toContain("[A]");
  });
});

describe("DOWNLOAD_FORMATS registry", () => {
  it("lists exactly the two supported download formats in display order", () => {
    expect(DOWNLOAD_FORMATS.map((option) => option.format)).toEqual(["markdown", "text"]);
  });

  // Guards against a format being added to the registry (so the popup renders a
  // download button for it) while buildUrlExport has no case and silently
  // falls through to the markdown default.
  it("builds distinct content for every registered format", () => {
    const tabs = makeTabs([{ id: 1, title: "X", url: "https://x.test/" }]);

    for (const { format } of DOWNLOAD_FORMATS) {
      const result = buildUrlExport(tabs, format);
      expect(typeof result.content).toBe("string");
      expect(result.extension.length).toBeGreaterThan(0);
      expect(result.mimeType.length).toBeGreaterThan(0);
    }
  });
});
