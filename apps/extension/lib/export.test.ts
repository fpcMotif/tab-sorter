import { describe, expect, it } from "vitest";

import { buildExportEntries, buildUrlExport } from "./export.ts";
import type { TabLite } from "./types.ts";

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
