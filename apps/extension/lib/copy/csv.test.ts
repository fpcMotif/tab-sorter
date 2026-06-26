import { describe, expect, it } from "vitest";

import { stringifyCSVRow, stringifyCSVRows } from "@/lib/copy/csv.ts";

describe("stringifyCSVRow", () => {
  it("joins plain string fields with commas, no quoting", () => {
    // donor: fields without comma/quote/newline/edge-space are emitted bare
    expect(stringifyCSVRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("quotes a field containing a comma", () => {
    // donor rxNeedsQuoting: /^\s|\s$|,|"|\n/
    expect(stringifyCSVRow(["a,b", "c"])).toBe('"a,b",c');
  });

  it("quotes and doubles internal quotes", () => {
    // donor: `"${value.replace(/"/g, '""')}"`
    expect(stringifyCSVRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(stringifyCSVRow(["line1\nline2"])).toBe('"line1\nline2"');
  });

  it("quotes a field with leading or trailing whitespace", () => {
    // donor: /^\s|\s$/ branches
    expect(stringifyCSVRow([" lead"])).toBe('" lead"');
    expect(stringifyCSVRow(["trail "])).toBe('"trail "');
  });

  it("renders null fields as empty and numbers as base-10 strings", () => {
    // donor stringifyFieldValue: null -> '', number -> toString(10)
    expect(stringifyCSVRow([null, 42, "x"])).toBe(",42,x");
  });
});

describe("stringifyCSVRows", () => {
  it("joins rows with a single newline", () => {
    // donor: rows.map(stringifyCSVRow).join('\n')
    expect(
      stringifyCSVRows([
        ["title", "url"],
        ["a,b", "http://x"],
      ]),
    ).toBe('title,url\n"a,b",http://x');
  });
});
