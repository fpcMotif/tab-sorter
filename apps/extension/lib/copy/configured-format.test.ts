import { describe, expect, it } from "vitest";

import { resolveConfiguredFormat } from "./configured-format.ts";
import { defineFormat } from "./format.ts";
import type { Format, FormatId, TabCtx } from "./format.ts";

// --- test fixtures: minimal Formats built via the Module D identity helper ---

// A format WITHOUT opts: its transforms ignore opts entirely.
const urlFormat = defineFormat({
  id: "url" as FormatId,
  label: () => "URL",
  transforms: () => ({
    text: { tab: ({ tab }: TabCtx) => tab.url },
  }),
});

// A format WITH opts: a single `separator` whose default is ": ".
// Whole-object overlay means a stored `{ separator: " | " }` fully replaces
// the default `{ separator: ": " }` — there is no other key to merge.
const titleUrlFormat = defineFormat({
  id: "titleUrl1Line" as FormatId,
  label: (o?: { separator: string }) => `Title${o?.separator ?? ": "}URL`,
  transforms: (o?: { separator: string }) => ({
    text: {
      tab: ({ tab }: TabCtx) => `${tab.title}${o?.separator ?? ": "}${tab.url}`,
    },
  }),
  defaultOpts: { separator: ": " },
});

// The `link` format: its text channel delegates to a fallback format resolved
// by id. Here it always delegates to `url`'s text transform via getFormatById.
const linkFormat = defineFormat({
  id: "link" as FormatId,
  label: () => "Link",
  transforms: () => ({
    text: { tab: ({ tab }: TabCtx) => tab.url },
    html: { tab: ({ tab }: TabCtx) => `<a href="${tab.url}">${tab.title}</a>` },
  }),
  defaultOpts: { plaintextFallback: "url" as FormatId },
});

const registry: Record<string, Format<any>> = {
  url: urlFormat,
  titleUrl1Line: titleUrlFormat,
  link: linkFormat,
};
const getFormatById = (id: FormatId): Format<any> => registry[id as string]!;

const sampleTab = {
  id: 1,
  url: "https://example.com",
  title: "Example",
  index: 0,
  pinned: false,
};

describe("resolveConfiguredFormat", () => {
  it("flattens id, label, and transforms for an opts-less format", () => {
    const cf = resolveConfiguredFormat(urlFormat, undefined, getFormatById);
    expect(cf.id).toBe("url");
    expect(cf.label).toBe("URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
  });

  it("falls back to the format's defaultOpts when storedOpts is nullish", () => {
    const cf = resolveConfiguredFormat(titleUrlFormat, undefined, getFormatById);
    expect(cf.label).toBe("Title: URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "Example: https://example.com",
    );
  });

  it("applies stored opts as a WHOLE-OBJECT replace (not a deep merge)", () => {
    // stored opts replace defaults entirely; a partial object that omits a
    // default key must NOT inherit it — proving overlay is replace, not merge.
    const cf = resolveConfiguredFormat(
      titleUrlFormat,
      { separator: " | " },
      getFormatById,
    );
    expect(cf.label).toBe("Title | URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "Example | https://example.com",
    );
  });

  it("resolves the link text channel through the injected getFormatById fallback", () => {
    const cf = resolveConfiguredFormat(linkFormat, undefined, getFormatById);
    // text channel delegates to `url`'s tab transform (plaintext fallback)
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
    // html channel is link's own anchor markup
    expect(cf.transforms.html?.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      '<a href="https://example.com">Example</a>',
    );
  });

  it("guards the link fallback against self-reference (no infinite recursion)", () => {
    // even if stored opts point the fallback back at `link`, resolution must
    // not recurse — it falls through to the default `url` text transform.
    const cf = resolveConfiguredFormat(
      linkFormat,
      { plaintextFallback: "link" as FormatId },
      getFormatById,
    );
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
  });
});
