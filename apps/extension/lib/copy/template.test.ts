import { describe, expect, it } from "vitest";

import {
  TEMPLATE_FIELDS,
  getFieldTokens,
  interpolate,
  type TemplateFieldId,
} from "./template.ts";
import type { TabLite } from "./types.ts";

// Fixed instant so [date]/[time] tokens are deterministic regardless of locale/TZ.
const NOW = new Date("2026-06-26T15:04:05.000Z");
const clock = () => NOW;

// Deterministic URL parser injection: real URL parse, malformed -> null (DEVIATION #5).
const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const tab: TabLite = {
  id: 1,
  url: "https://example.com/docs/guide?q=1#frag",
  title: "Hello & <World>",
  index: 0,
  pinned: false,
  favIconUrl: "https://example.com/favicon.ico",
};

describe("TEMPLATE_FIELDS", () => {
  it("declares the 7 donor template fields in order", () => {
    // Donor template-field.ts `templateFields` ids, in order.
    expect(TEMPLATE_FIELDS.map((f) => f.id)).toEqual([
      "start",
      "windowStart",
      "tab",
      "tabDelimiter",
      "windowEnd",
      "windowDelimiter",
      "end",
    ]);
  });

  it("gates tokens per field via allow-lists", () => {
    // Donor: `tab` field allows tab-title; `tabDelimiter` only allows newline/tabulator.
    const tabTokens = getFieldTokens("tab").map((t) => t.id);
    expect(tabTokens).toContain("tab-title");
    expect(tabTokens).toContain("tab-url");
    const delimTokens = getFieldTokens("tabDelimiter").map((t) => t.id);
    expect(delimTokens).toEqual(["newline", "tabulator"]);
    expect(delimTokens).not.toContain("tab-title");
  });
});

describe("interpolate - tab field tokens (text)", () => {
  const run = (template: string) =>
    interpolate(
      "tab",
      { tab: template } as Record<TemplateFieldId, string>,
      { tab, parsedUrl: parseUrl(tab.url), tabSeq: 3, windowTabSeq: 2, windowSeq: 1, windowCount: 2, representation: "text" },
    );

  it("[title] -> tab title", () => {
    expect(run("[title]")).toBe("Hello & <World>");
  });
  it("[url] -> tab url", () => {
    expect(run("[url]")).toBe("https://example.com/docs/guide?q=1#frag");
  });
  it("[icon] -> favIconUrl", () => {
    expect(run("[icon]")).toBe("https://example.com/favicon.ico");
  });
  it("[link] text channel -> url", () => {
    // Donor tab-link token: text representation returns tab.url.
    expect(run("[link]")).toBe("https://example.com/docs/guide?q=1#frag");
  });
  it("[schema] -> protocol without trailing colon", () => {
    expect(run("[schema]")).toBe("https");
  });
  it("[host] -> url host", () => {
    expect(run("[host]")).toBe("example.com");
  });
  it("[path] -> pathname without leading slash", () => {
    expect(run("[path]")).toBe("docs/guide");
  });
  it("[query] -> search without leading question mark", () => {
    expect(run("[query]")).toBe("q=1");
  });
  it("[hash] -> hash without leading hash", () => {
    expect(run("[hash]")).toBe("frag");
  });
  it("[t#] -> tabSeq (globalSeq)", () => {
    expect(run("[t#]")).toBe("3");
  });
  it("[wt#] -> windowTabSeq", () => {
    expect(run("[wt#]")).toBe("2");
  });
  it("[w#] -> windowSeq", () => {
    expect(run("[w#]")).toBe("1");
  });
  it("[n] -> newline (text)", () => {
    expect(run("a[n]b")).toBe("a\nb");
  });
  it("[t] -> tab char (text)", () => {
    expect(run("a[t]b")).toBe("a\tb");
  });
  it("padded token text is tolerated: [ title ]", () => {
    // Donor regex captures optional surrounding whitespace inside brackets.
    expect(run("[ title ]")).toBe("Hello & <World>");
  });
});

describe("interpolate - html representation", () => {
  const run = (template: string) =>
    interpolate(
      "tab",
      { tab: template } as Record<TemplateFieldId, string>,
      { tab, parsedUrl: parseUrl(tab.url), representation: "html" },
    );

  it("[title] html-encodes the title", () => {
    expect(run("[title]")).toBe("Hello &amp; &lt;World&gt;");
  });
  it("[link] html channel -> anchor tag with encoded label", () => {
    // Donor getAnchorTagHtml: <a href="url">encodeHtml(title||url)</a>.
    expect(run("[link]")).toBe(
      '<a href="https://example.com/docs/guide?q=1#frag">Hello &amp; &lt;World&gt;</a>',
    );
  });
  it("[n] -> <br> newline (html)", () => {
    expect(run("a[n]b")).toBe("a<br>\nb");
  });
  it("[t] -> &#9; tab entity (html)", () => {
    expect(run("a[t]b")).toBe("a&#9;b");
  });
});

describe("interpolate - start/end fields, clock, counts, format name", () => {
  it("[date] uses injected clock's toLocaleDateString", () => {
    expect(
      interpolate("start", { start: "[date]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleDateString());
  });
  it("[time] uses injected clock's toLocaleTimeString", () => {
    expect(
      interpolate("end", { end: "[time]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleTimeString());
  });
  it("[date+time] uses toLocaleString", () => {
    expect(
      interpolate("start", { start: "[date+time]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleString());
  });
  it("[tcount]/[wcount]/[fname] resolve from sources", () => {
    expect(
      interpolate(
        "start",
        { start: "[tcount]/[wcount] [fname]" } as Record<TemplateFieldId, string>,
        { tabCount: 5, windowCount: 2, formatName: "My Format", representation: "text" },
      ),
    ).toBe("5/2 My Format");
  });
});

describe("interpolate - literal survival of out-of-allow-list tokens", () => {
  it("[title] is NOT a tabDelimiter token, survives literally", () => {
    // Donor: getFieldTokens('tabDelimiter') excludes tab-title, so its regex never runs.
    expect(
      interpolate("tabDelimiter", { tabDelimiter: "[title]" } as Record<TemplateFieldId, string>, {
        tab,
        representation: "text",
      }),
    ).toBe("[title]");
  });
  it("an unknown token survives literally in any field", () => {
    expect(
      interpolate("tab", { tab: "x[bogus]y" } as Record<TemplateFieldId, string>, {
        tab,
        parsedUrl: parseUrl(tab.url),
        representation: "text",
      }),
    ).toBe("x[bogus]y");
  });
});

describe("interpolate - DEVIATION #5: malformed url -> empty, no throw", () => {
  // render.ts (caller) passes parsedUrl:null for URLs it can't parse (about:, chrome:, etc).
  // template.ts must emit "" for all URL-derived tokens when parsedUrl is null — no throw.
  const malformed: TabLite = { id: 2, url: "about:blank", title: "Blank", index: 0, pinned: false };
  const run = (template: string) =>
    interpolate("tab", { tab: template } as Record<TemplateFieldId, string>, {
      tab: malformed,
      parsedUrl: null, // simulates caller passing null for unparseable URL
      representation: "text",
    });

  it("[host] on unparseable url -> empty string, does not throw", () => {
    expect(() => run("[host]")).not.toThrow();
    expect(run("[host]")).toBe("");
  });
  it("[schema]/[path]/[query]/[hash] all empty on malformed url", () => {
    expect(run("[schema][path][query][hash]")).toBe("");
  });
});

describe("interpolate - pinned-clock determinism", () => {
  it("repeated [date] interpolations with the same clock are stable", () => {
    const a = interpolate("start", { start: "[date] [time]" } as Record<TemplateFieldId, string>, {
      now: clock(),
      representation: "text",
    });
    const b = interpolate("start", { start: "[date] [time]" } as Record<TemplateFieldId, string>, {
      now: clock(),
      representation: "text",
    });
    expect(a).toBe(b);
    expect(a).toBe(`${NOW.toLocaleDateString()} ${NOW.toLocaleTimeString()}`);
  });
});
