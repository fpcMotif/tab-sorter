import { describe, expect, it } from "vitest";

import { buildClipboardItem } from "./clipboard-item.ts";

describe("buildClipboardItem", () => {
  it("always includes a text/plain entry", () => {
    // Donor clipboardWrite always writes 'text/plain': new Blob([text]).
    expect(buildClipboardItem({ text: "hello" })).toEqual([
      { mimeType: "text/plain", data: "hello" },
    ]);
  });

  it("adds a text/html entry when html is present", () => {
    // Donor adds 'text/html': new Blob([html]) only when `html` is truthy.
    expect(
      buildClipboardItem({ text: "hello", html: "<a>hello</a>" }),
    ).toEqual([
      { mimeType: "text/plain", data: "hello" },
      { mimeType: "text/html", data: "<a>hello</a>" },
    ]);
  });

  it("omits text/html when html is an empty string", () => {
    // Donor's `...(html ? {...} : null)` treats "" as falsy → no html part.
    expect(buildClipboardItem({ text: "x", html: "" })).toEqual([
      { mimeType: "text/plain", data: "x" },
    ]);
  });

  it("preserves text/plain before text/html ordering", () => {
    const parts = buildClipboardItem({ text: "t", html: "<b>t</b>" });
    expect(parts.map((p) => p.mimeType)).toEqual(["text/plain", "text/html"]);
  });
});
