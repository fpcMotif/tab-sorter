import { describe, expect, it } from "vitest";

import {
  defineFormat,
  getFormat,
  isCustomFormatId,
  isFormatId,
  type Format,
  type FormatId,
} from "@/lib/copy/format.ts";
import type { StartCtx, TabCtx, TabLite } from "@/lib/copy/types.ts";

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

const tabFav: TabLite = {
  id: 4,
  url: "https://d.com/",
  title: "Dee",
  index: 0,
  pinned: false,
  favIconUrl: "https://d.com/fav.ico",
};

function start(scope: "tab" | "window", tabCount: number): StartCtx {
  return { formatName: "test", tabCount, scope };
}

describe("csv format", () => {
  it("emits no Window column in tab scope (donor:189-190)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("tab", 2))).toBe("Title,URL\n");
    expect(t.tab(ctx(tabA))).toBe("Alpha,https://a.com/p");
    expect(t.tabDelimiter).toBe("\n");
  });

  it("emits a Window column and per-row window cell in window scope (donor:192-204)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("window", 2))).toBe("Window,Title,URL\n");
    expect(t.tab({ tab: tabA, globalSeq: 1, windowSeq: 1 })).toBe(
      "Window 1,Alpha,https://a.com/p",
    );
  });

  it("emits empty string for start when there are no tabs (donor:189)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("tab", 0))).toBe("");
  });

  it("renders an empty title as a blank field (donor:197 title||null)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe(",https://b.com/");
  });
});

describe("json format", () => {
  it("renders pretty default output across the start/tab/end walk (donor:222-269)", () => {
    const t = getFormat("json").transforms().text;
    expect(t.start!(start("tab", 1))).toBe("[");
    // pretty:true, indent:2, default properties [title,url]; tab scope (no windowSeq)
    expect(t.tab(ctx(tabA))).toBe(
      '\n  {\n    "title": "Alpha",\n    "url": "https://a.com/p"\n  }',
    );
    expect(t.tabDelimiter).toBe(",");
    expect(t.end!(start("tab", 1))).toBe("\n]");
  });

  it("includes favIconUrl when present and selected (donor:251-253)", () => {
    const t = getFormat("json").transforms({
      properties: ["title", "url", "favIconUrl"],
      pretty: true,
      indent: "2",
    }).text;
    expect(t.tab(ctx(tabFav))).toBe(
      '\n  {\n    "title": "Dee",\n    "url": "https://d.com/",\n    "favIconUrl": "https://d.com/fav.ico"\n  }',
    );
  });

  it("emits compact output when pretty is false (donor:214-219)", () => {
    const t = getFormat("json").transforms({
      properties: ["title", "url"],
      pretty: false,
      indent: "2",
    }).text;
    expect(t.tab(ctx(tabA))).toBe('{"title":"Alpha","url":"https://a.com/p"}');
    expect(t.end!(start("tab", 1))).toBe("]");
  });

  it("isInvalid is true when pretty and indent is out of range (donor:286,680-686)", () => {
    const fmt = getFormat("json");
    expect(
      fmt.isInvalid!({ properties: ["title", "url"], pretty: true, indent: "0" }),
    ).toBe(true);
    expect(
      fmt.isInvalid!({ properties: ["title", "url"], pretty: true, indent: "2" }),
    ).toBe(false);
    expect(
      fmt.isInvalid!({
        properties: ["title", "url"],
        pretty: false,
        indent: "0",
      }),
    ).toBe(false);
  });
});

describe("htmlTable format", () => {
  it("omits the header row by default (donor:308-317,327-329)", () => {
    const t = getFormat("htmlTable").transforms().text;
    expect(t.start!(start("tab", 1))).toBe("<table>\n  <tbody>\n");
    expect(t.tab(ctx(tabA))).toBe(
      "    <tr>\n      <td>Alpha</td>\n      <td>https://a.com/p</td>\n    </tr>\n",
    );
    expect(t.end!(start("tab", 1))).toBe("  </tbody>\n</table>");
  });

  it("includes a header row (with Window column in window scope) when includeHeader is set (donor:310-317,637-652)", () => {
    const t = getFormat("htmlTable").transforms({ includeHeader: true }).text;
    expect(t.start!(start("window", 1))).toBe(
      "<table>\n  <thead>\n    <tr>\n      <th>Window</th>\n      <th>Title</th>\n      <th>URL</th>\n    </tr>\n  </thead>\n  <tbody>\n",
    );
  });

  it("renders a Window cell per row in window scope (donor:654-669)", () => {
    const t = getFormat("htmlTable").transforms().text;
    expect(t.tab({ tab: tabA, globalSeq: 1, windowSeq: 2 })).toBe(
      "    <tr>\n      <td>Window 2</td>\n      <td>Alpha</td>\n      <td>https://a.com/p</td>\n    </tr>\n",
    );
  });
});
