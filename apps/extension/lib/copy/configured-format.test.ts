import { describe, expect, it } from "vitest";

import { resolveConfiguredFormat } from "./configured-format.ts";
import { defineFormat } from "./format.ts";
import type { Format, FormatId } from "./format.ts";
// TabCtx is a Module A type (its canonical home is types.ts); format.ts consumes
// it but does not re-export it, so import it from its source.
import type { TabCtx } from "./types.ts";

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

// A format with TWO opts keys, so the replace-vs-merge distinction is provable:
// pass storedOpts that OMITS `suffix` and assert it is GONE (falls back to the
// callback's `?? ""`), proving the overlay REPLACES defaultOpts wholesale rather
// than merging the missing key back in from defaults.
type TwoKeyOpts = { prefix: string; suffix: string };
const twoKeyFormat = defineFormat({
  id: "titleUrl1Line" as FormatId, // id reused only as a stand-in; behavior is the point
  label: (o?: TwoKeyOpts) => `${o?.prefix ?? "<P>"}|${o?.suffix ?? "<S>"}`,
  transforms: (o?: TwoKeyOpts) => ({
    text: {
      tab: ({ tab }: TabCtx) =>
        `${o?.prefix ?? "<P>"}${tab.url}${o?.suffix ?? "<S>"}`,
    },
  }),
  defaultOpts: { prefix: "PRE-", suffix: "-SUF" },
});

// The `link` format. Its OWN text channel emits a DISTINCT marker so that when
// the resolver redirects to the `url` fallback we can tell the two apart: if the
// guard fired and redirected to `url`, output is the plain url (no marker); if
// link's own channel had leaked through, output would carry "LINK-TEXT:".
const linkFormat = defineFormat({
  id: "link" as FormatId,
  label: () => "Link",
  transforms: () => ({
    text: { tab: ({ tab }: TabCtx) => `LINK-TEXT:${tab.url}` },
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

  it("applies stored opts as a WHOLE-OBJECT replace, dropping omitted keys (not a merge)", () => {
    // defaultOpts has TWO keys { prefix, suffix }; storedOpts supplies ONLY
    // `prefix`. A whole-object overlay REPLACES the entire defaultOpts, so the
    // omitted `suffix` is GONE (callback falls back to "<S>"), NOT inherited
    // from the default "-SUF". A deep merge would keep "-SUF"; this asserts it
    // does not.
    const cf = resolveConfiguredFormat(
      twoKeyFormat,
      { prefix: "X-" },
      getFormatById,
    );
    // suffix dropped → "<S>" placeholder, NOT the default "-SUF"
    expect(cf.label).toBe("X-|<S>");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "X-https://example.com<S>",
    );
    // explicit no-merge assertion: the default suffix must not survive.
    expect(cf.label).not.toContain("-SUF");
  });

  it("resolves the link text channel through the injected getFormatById fallback", () => {
    const cf = resolveConfiguredFormat(linkFormat, undefined, getFormatById);
    // text channel is redirected to `url`'s tab transform (plaintext fallback):
    // the plain url with NO "LINK-TEXT:" marker proves it is url's channel, not
    // link's own.
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
    // html channel is link's own anchor markup (untouched by the fallback swap)
    expect(cf.transforms.html?.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      '<a href="https://example.com">Example</a>',
    );
  });

  it("guards the link fallback against self-reference, redirecting to url (no recursion)", () => {
    // even if stored opts point the fallback back at `link`, resolution must
    // not recurse — it falls through to the default `url` text transform. The
    // url channel emits the plain url; link's own channel would have emitted
    // "LINK-TEXT:…", so the absence of that marker proves the guard redirected
    // to url rather than leaving link's own (self-referential) channel in place.
    const cf = resolveConfiguredFormat(
      linkFormat,
      { plaintextFallback: "link" as FormatId },
      getFormatById,
    );
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).not.toContain(
      "LINK-TEXT:",
    );
  });
});
