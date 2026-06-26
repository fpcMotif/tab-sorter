import { describe, expect, it } from "vitest";

import { deriveFileMeta } from "./file-meta.ts";

describe("deriveFileMeta — extension per format", () => {
  // Parity source: target lib/export.ts mapped markdown -> "md"/"text/markdown".
  it("markdown -> md / text/markdown", () => {
    expect(deriveFileMeta("markdown", 3)).toMatchObject({
      extension: "md",
      mimeType: "text/markdown",
    });
  });

  // csv is a tabular text format; .csv / text/csv is the conventional pairing.
  it("csv -> csv / text/csv", () => {
    expect(deriveFileMeta("csv", 3)).toMatchObject({
      extension: "csv",
      mimeType: "text/csv",
    });
  });

  // json format (donor format.ts id 'json') -> .json / application/json.
  it("json -> json / application/json", () => {
    expect(deriveFileMeta("json", 3)).toMatchObject({
      extension: "json",
      mimeType: "application/json",
    });
  });

  // htmlTable + html render to markup; donor clipboard.ts uses the text/html mime.
  it("htmlTable -> html / text/html", () => {
    expect(deriveFileMeta("htmlTable", 3)).toMatchObject({
      extension: "html",
      mimeType: "text/html",
    });
  });

  it("html -> html / text/html", () => {
    expect(deriveFileMeta("html", 3)).toMatchObject({
      extension: "html",
      mimeType: "text/html",
    });
  });

  // All other text-channel builtins fall back to plain text (.txt / text/plain),
  // matching the donor's text/plain clipboard channel.
  it.each(["link", "url", "titleUrl1Line", "titleUrl2Line", "title", "bbcode"] as const)(
    "%s -> txt / text/plain",
    (id) => {
      expect(deriveFileMeta(id, 3)).toMatchObject({
        extension: "txt",
        mimeType: "text/plain",
      });
    },
  );

  // Custom formats are arbitrary text templates -> default to txt / text/plain.
  it("custom-* -> txt / text/plain", () => {
    expect(deriveFileMeta("custom-abc123", 3)).toMatchObject({
      extension: "txt",
      mimeType: "text/plain",
    });
  });
});

describe("deriveFileMeta — filename", () => {
  it("builds a tabs-<count>.<ext> filename", () => {
    expect(deriveFileMeta("markdown", 3).filename).toBe("tabs-3.md");
  });

  it("singular-safe for one tab", () => {
    expect(deriveFileMeta("csv", 1).filename).toBe("tabs-1.csv");
  });

  it("handles zero tabs", () => {
    expect(deriveFileMeta("url", 0).filename).toBe("tabs-0.txt");
  });
});
