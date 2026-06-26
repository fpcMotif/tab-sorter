import { describe, expect, it } from "vitest";

import { enumerateSelection, render } from "./render.ts";
import type { ConfiguredFormat } from "./configured-format.ts";
import type { ScopeSelection, TabLite, Transforms, WindowLite } from "./types.ts";

function tab(id: number, title: string, url: string, index: number): TabLite {
  return { id, title, url, index, pinned: false };
}

// `url` format text channel — donor format.ts:609-617 (urlTextTransform):
//   tab => tab.url ; tabDelimiter '\n' ; windowStart `Window ${seq}\n\n` ;
//   windowDelimiter '\n\n' ; no start/end.
const urlTransforms: Transforms = {
  text: {
    windowStart: ({ seq }) => `Window ${seq}\n\n`,
    tab: ({ tab }) => tab.url,
    tabDelimiter: "\n",
    windowDelimiter: "\n\n",
  },
};

// html-channel format — donor `link` html hooks, format.ts:63-71 + getAnchorTagHtml (format.ts:627-631):
//   html.tab => `<a href="url">title</a>` ; tabDelimiter '<br>\n' ;
//   windowStart `Window ${seq}<br>\n<br>\n` ; windowDelimiter '<br>\n<br>\n'.
const linkTransforms: Transforms = {
  text: {
    tab: ({ tab }) => tab.url,
    tabDelimiter: "\n",
    windowStart: ({ seq }) => `Window ${seq}\n\n`,
    windowDelimiter: "\n\n",
  },
  html: {
    windowStart: ({ seq }) => `Window ${seq}<br>\n<br>\n`,
    tab: ({ tab }) => `<a href="${tab.url}">${tab.title || tab.url}</a>`,
    tabDelimiter: "<br>\n",
    windowDelimiter: "<br>\n<br>\n",
  },
};

function configured(transforms: Transforms): ConfiguredFormat {
  return { id: "url", label: "URL", transforms };
}

const tabs: TabLite[] = [
  tab(1, "Alpha", "https://a.example.com/", 0),
  tab(2, "Beta", "https://b.example.com/", 1),
];

const windows: WindowLite[] = [
  {
    id: 10,
    tabs: [
      tab(1, "Alpha", "https://a.example.com/", 0),
      tab(2, "Beta", "https://b.example.com/", 1),
    ],
  },
  { id: 11, tabs: [tab(3, "Gamma", "https://c.example.com/", 0)] },
];

describe("render — tab scope", () => {
  it("joins tab hooks with the tab delimiter (text only when no html transform)", () => {
    const selection: ScopeSelection = { scope: "tab", tabs };
    const result = render(selection, configured(urlTransforms));
    expect(result).toEqual({
      text: "https://a.example.com/\nhttps://b.example.com/",
    });
    expect(result.html).toBeUndefined();
  });

  it("renders both channels when transforms.html is present", () => {
    const selection: ScopeSelection = { scope: "tab", tabs };
    const result = render(selection, configured(linkTransforms));
    expect(result.text).toBe("https://a.example.com/\nhttps://b.example.com/");
    expect(result.html).toBe(
      '<a href="https://a.example.com/">Alpha</a><br>\n<a href="https://b.example.com/">Beta</a>',
    );
  });

  it("numbers globalSeq 1-based across the tab list", () => {
    const seqs: number[] = [];
    const probe: Transforms = {
      text: {
        tab: ({ globalSeq }) => {
          seqs.push(globalSeq);
          return "";
        },
        tabDelimiter: "",
      },
    };
    render({ scope: "tab", tabs }, configured(probe));
    expect(seqs).toEqual([1, 2]);
  });

  it("does NOT fire window hooks in tab scope (windowStart/windowEnd/windowDelimiter ignored)", () => {
    let windowStartCalls = 0;
    let windowEndCalls = 0;
    const probe: Transforms = {
      text: {
        windowStart: () => {
          windowStartCalls++;
          return "WS";
        },
        windowEnd: () => {
          windowEndCalls++;
          return "WE";
        },
        windowDelimiter: "WD",
        tab: ({ tab }) => tab.url,
        tabDelimiter: "\n",
      },
    };
    const result = render({ scope: "tab", tabs }, configured(probe));
    expect(windowStartCalls).toBe(0);
    expect(windowEndCalls).toBe(0);
    expect(result.text).toBe("https://a.example.com/\nhttps://b.example.com/");
  });

  it("carries only globalSeq on tab ctx (no windowSeq/windowTabSeq)", () => {
    const captured: {
      globalSeq: number;
      windowSeq?: number;
      windowTabSeq?: number;
    }[] = [];
    const probe: Transforms = {
      text: {
        tab: ({ globalSeq, windowSeq, windowTabSeq }) => {
          captured.push({ globalSeq, windowSeq, windowTabSeq });
          return "";
        },
        tabDelimiter: "",
      },
    };
    render({ scope: "tab", tabs }, configured(probe));
    expect(captured).toEqual([
      { globalSeq: 1, windowSeq: undefined, windowTabSeq: undefined },
      { globalSeq: 2, windowSeq: undefined, windowTabSeq: undefined },
    ]);
  });
});

describe("render — window scope", () => {
  it("emits windowStart/windowEnd and joins windows with windowDelimiter", () => {
    const selection: ScopeSelection = { scope: "window", windows };
    const result = render(selection, configured(urlTransforms));
    expect(result.text).toBe(
      "Window 1\n\nhttps://a.example.com/\nhttps://b.example.com/\n\nWindow 2\n\nhttps://c.example.com/",
    );
  });

  it("runs globalSeq across windows and resets windowTabSeq per window", () => {
    const captured: {
      globalSeq: number;
      windowSeq?: number;
      windowTabSeq?: number;
    }[] = [];
    const probe: Transforms = {
      text: {
        tab: ({ globalSeq, windowSeq, windowTabSeq }) => {
          captured.push({ globalSeq, windowSeq, windowTabSeq });
          return "";
        },
        tabDelimiter: "",
        windowDelimiter: "",
      },
    };
    render({ scope: "window", windows }, configured(probe));
    expect(captured).toEqual([
      { globalSeq: 1, windowSeq: 1, windowTabSeq: 1 },
      { globalSeq: 2, windowSeq: 1, windowTabSeq: 2 },
      { globalSeq: 3, windowSeq: 2, windowTabSeq: 1 },
    ]);
  });

  it("passes windowCount and windowTabCount to window hooks", () => {
    const seen: { seq: number; windowCount: number; windowTabCount: number }[] =
      [];
    const probe: Transforms = {
      text: {
        windowStart: ({ seq, windowCount, windowTabCount }) => {
          seen.push({ seq, windowCount, windowTabCount });
          return "";
        },
        tab: () => "",
        tabDelimiter: "",
        windowDelimiter: "",
      },
    };
    render({ scope: "window", windows }, configured(probe));
    expect(seen).toEqual([
      { seq: 1, windowCount: 2, windowTabCount: 2 },
      { seq: 2, windowCount: 2, windowTabCount: 1 },
    ]);
  });

  it("renders the html channel across windows when present", () => {
    const result = render(
      { scope: "window", windows },
      configured(linkTransforms),
    );
    expect(result.html).toBe(
      'Window 1<br>\n<br>\n<a href="https://a.example.com/">Alpha</a><br>\n' +
        '<a href="https://b.example.com/">Beta</a><br>\n<br>\nWindow 2<br>\n<br>\n' +
        '<a href="https://c.example.com/">Gamma</a>',
    );
  });
});

describe("render — empty selection still renders start/end", () => {
  // Donor copy.ts:136-149 never short-circuits the assembly: an empty tabs array
  // still emits start?.()+''+end?.(). The console.warn is logging only (dropped here).
  it("fires start and end on an empty tab selection", () => {
    const probe: Transforms = {
      text: {
        start: ({ tabCount, scope }) => `[start tab=${tabCount} scope=${scope}]`,
        tab: ({ tab }) => tab.url,
        tabDelimiter: "\n",
        end: ({ tabCount }) => `[end tab=${tabCount}]`,
      },
    };
    const result = render({ scope: "tab", tabs: [] }, configured(probe));
    expect(result.text).toBe("[start tab=0 scope=tab][end tab=0]");
  });

  it("fires start and end on an empty window selection", () => {
    const probe: Transforms = {
      text: {
        start: ({ tabCount, windowCount, scope }) =>
          `[start tab=${tabCount} win=${windowCount} scope=${scope}]`,
        windowStart: ({ seq }) => `W${seq}`,
        tab: ({ tab }) => tab.url,
        tabDelimiter: "\n",
        windowDelimiter: "\n",
        end: ({ tabCount, windowCount }) =>
          `[end tab=${tabCount} win=${windowCount}]`,
      },
    };
    const result = render({ scope: "window", windows: [] }, configured(probe));
    expect(result.text).toBe("[start tab=0 win=0 scope=window][end tab=0 win=0]");
  });
});

// Reconciliation #6: the per-tab numbering is factored into a shared, exported
// helper so Module H (entries) imports the SAME source of truth — render text and
// entries[] can never drift on globalSeq/windowSeq/windowTabSeq.
describe("enumerateSelection — shared numbering helper", () => {
  it("yields globalSeq 1-based with no window seqs for tab scope", () => {
    const rows = [...enumerateSelection({ scope: "tab", tabs })];
    expect(rows).toEqual([
      { tab: tabs[0], globalSeq: 1 },
      { tab: tabs[1], globalSeq: 2 },
    ]);
  });

  it("yields continuous globalSeq with per-window seqs for window scope", () => {
    const rows = [...enumerateSelection({ scope: "window", windows })];
    expect(rows).toEqual([
      { tab: windows[0]!.tabs[0], globalSeq: 1, windowSeq: 1, windowTabSeq: 1 },
      { tab: windows[0]!.tabs[1], globalSeq: 2, windowSeq: 1, windowTabSeq: 2 },
      { tab: windows[1]!.tabs[0], globalSeq: 3, windowSeq: 2, windowTabSeq: 1 },
    ]);
  });

  it("yields nothing for an empty selection (both scopes)", () => {
    expect([...enumerateSelection({ scope: "tab", tabs: [] })]).toEqual([]);
    expect([...enumerateSelection({ scope: "window", windows: [] })]).toEqual(
      [],
    );
  });
});
