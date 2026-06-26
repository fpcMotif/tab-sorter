import { describe, expect, it } from "vitest";

import {
  defineFormat,
  getFormat,
  isCustomFormatId,
  isFormatId,
  type Format,
  type FormatId,
} from "@/lib/copy/format.ts";
import type { TabCtx, TabLite } from "@/lib/copy/types.ts";

describe("defineFormat", () => {
  it("is an identity helper that infers opts type for typed callbacks", () => {
    const spec = defineFormat({
      id: "url" as const,
      label: () => "URL",
      transforms: () => ({ text: { tab: ({ tab }: TabCtx) => tab.url } }),
    });
    // identity: returns exactly what was passed
    expect(spec.id).toBe("url");
    expect(spec.label()).toBe("URL");
  });
});

describe("FormatId guards", () => {
  it("isFormatId accepts builtin ids and custom-* ids", () => {
    expect(isFormatId("url")).toBe(true);
    expect(isFormatId("link")).toBe(true);
    expect(isFormatId("custom-abc123")).toBe(true);
  });

  it("isFormatId rejects unknown ids", () => {
    expect(isFormatId("nope")).toBe(false);
    expect(isFormatId("")).toBe(false);
  });

  it("isCustomFormatId only matches the custom- prefix", () => {
    expect(isCustomFormatId("custom-x")).toBe(true);
    expect(isCustomFormatId("url")).toBe(false);
  });
});

describe("getFormat", () => {
  it("returns the registered builtin format by id", () => {
    const fmt: Format = getFormat("url");
    expect(fmt.id).toBe("url");
    const id: FormatId = "url";
    expect(getFormat(id).label()).toBe("URL");
  });

  it("throws on an unknown id", () => {
    // @ts-expect-error testing runtime guard with an invalid id
    expect(() => getFormat("nope")).toThrow();
  });
});

const tabA: TabLite = {
  id: 1,
  url: "https://a.com/p",
  title: "Alpha",
  index: 0,
  pinned: false,
};
const tabUntitled: TabLite = {
  id: 2,
  url: "https://b.com/",
  title: "",
  index: 1,
  pinned: false,
};
const tabBrackets: TabLite = {
  id: 3,
  url: "https://c.com/(x)",
  title: "Re[mix]",
  index: 2,
  pinned: false,
};

function ctx(tab: TabLite, globalSeq = 1, windowSeq?: number): TabCtx {
  return { tab, globalSeq, windowSeq };
}

describe("url format", () => {
  it("renders tab.url, with \\n delimiter and Window header (donor format.ts:609-617)", () => {
    const t = getFormat("url").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
    expect(t.tabDelimiter).toBe("\n");
    expect(
      t.windowStart!({
        window: { id: 1, tabs: [] },
        seq: 2,
        windowCount: 1,
        windowTabCount: 0,
      }),
    ).toBe("Window 2\n\n");
    expect(t.windowDelimiter).toBe("\n\n");
  });
});

describe("titleUrl1Line format", () => {
  it("joins title and url with ': ' by default (donor getTitleUrlText:619-625)", () => {
    const t = getFormat("titleUrl1Line").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha: https://a.com/p");
  });

  it("uses '(untitled)' for an empty title (donor:624)", () => {
    const t = getFormat("titleUrl1Line").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe("(untitled): https://b.com/");
  });

  it("honors the separator opt (whole-object overlay)", () => {
    const t = getFormat("titleUrl1Line").transforms({ separator: " — " }).text;
    expect(t.tab(ctx(tabA))).toBe("Alpha — https://a.com/p");
  });
});

describe("titleUrl2Line format", () => {
  it("joins with a newline; tab delimiter is blank line (donor:104-118)", () => {
    const t = getFormat("titleUrl2Line").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha\nhttps://a.com/p");
    expect(t.tabDelimiter).toBe("\n\n");
  });
});

describe("title format", () => {
  it("falls back to url when title is empty (donor:126)", () => {
    const t = getFormat("title").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha");
    expect(t.tab(ctx(tabUntitled))).toBe("https://b.com/");
  });
});

describe("markdown format", () => {
  it("escapes [] in title and () in url; ## window header (donor:135-159)", () => {
    const t = getFormat("markdown").transforms().text;
    expect(t.tab(ctx(tabBrackets))).toBe(
      "[Re\\[mix\\]](https://c.com/\\(x\\))",
    );
    expect(t.tabDelimiter).toBe("\n\n");
    expect(
      t.windowStart!({
        window: { id: 1, tabs: [] },
        seq: 1,
        windowCount: 1,
        windowTabCount: 0,
      }),
    ).toBe("## Window 1\n\n");
  });

  it("uses url as link text when title is empty (donor:145)", () => {
    const t = getFormat("markdown").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe("[https://b.com/](https://b.com/)");
  });
});

describe("link format", () => {
  it("html channel emits anchor tags with encoded text (donor getAnchorTagHtml:627-631)", () => {
    const h = getFormat("link").transforms().html!;
    expect(h.tab(ctx(tabA))).toBe('<a href="https://a.com/p">Alpha</a>');
    expect(h.tabDelimiter).toBe("<br>\n");
    expect(
      h.windowStart!({
        window: { id: 1, tabs: [] },
        seq: 1,
        windowCount: 1,
        windowTabCount: 0,
      }),
    ).toBe("Window 1<br>\n<br>\n");
  });

  it("text channel delegates to the url fallback by default (donor plaintextFallback='url':22,59-61)", () => {
    const t = getFormat("link").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
  });

  it("never delegates to itself; an explicit 'link' fallback resolves to url", () => {
    const t = getFormat("link").transforms({ plaintextFallback: "link" }).text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
  });
});
