/**
 * Real end-to-end integration test for the Tab Copy pure pipeline.
 * NO mocking — all copy modules are the actual implementations.
 *
 * Exercises: selectScope → resolveConfiguredFormat(getFormat) → render → buildPayload
 * and asserts byte-exact golden output for key format × scope combinations.
 *
 * The existing orchestration-copy.test.ts only checks wiring with mocks; this
 * file proves the modules genuinely connect and produce correct bytes.
 */
import { describe, expect, it } from "vitest";

import { selectScope } from "./scope.ts";
import { getFormat } from "./format.ts";
import { resolveConfiguredFormat } from "./configured-format.ts";
import { render } from "./render.ts";
import { buildPayload } from "./payload.ts";
import {
  multiWindowSnapshot,
  normalTab,
  singleWindowSnapshot,
  tabWithFavIcon,
  tabWithoutFavIcon,
} from "./__fixtures__/tabs.ts";
import type { ScopeId } from "./types.ts";
import type { FormatId } from "./format.ts";

// ---------------------------------------------------------------------------
// Pipeline helper — mirrors runCopy minus chrome + sink
// ---------------------------------------------------------------------------

function runPipeline(
  snapshot: Parameters<typeof selectScope>[0],
  scopeId: ScopeId,
  formatId: FormatId,
) {
  const selection = selectScope(snapshot, scopeId, true);
  const configured = resolveConfiguredFormat(
    getFormat(formatId),
    undefined,
    getFormat,
  );
  const rendered = render(selection, configured);
  const payload = buildPayload(selection, rendered);
  return { selection, configured, rendered, payload };
}

// ---------------------------------------------------------------------------
// § TAB SCOPE — window-tabs on singleWindowSnapshot
//
// singleWindow.tabs = [normalTab, untitledTab, pinnedTab]
// selectScope(…, "window-tabs", true) → all three (includePinned=true)
//
// Golden strings hand-derived from the fixture data and the format transforms
// in format.ts, cross-checked against donor tab-copy-master/src/format.ts.
// ---------------------------------------------------------------------------

describe("e2e — TAB scope (window-tabs, singleWindowSnapshot)", () => {
  it("markdown: byte-exact golden, no html channel", () => {
    const { payload } = runPipeline(singleWindowSnapshot, "window-tabs", "markdown");

    // Markdown format: `[title](url)` with [ ] escaped in title, ( ) in url.
    // normalTab:   title="Example Page", url="https://example.com/page" — no escapes needed
    // untitledTab: title="" → falls back to url in the `title || url` branch
    //              → "[https://example.com/untitled](https://example.com/untitled)"
    // pinnedTab:   title="Daily News", url="https://news.example.com/" — no escapes needed
    // tabDelimiter: "\n\n"  (no windowStart in tab scope)
    const expected =
      "[Example Page](https://example.com/page)\n\n" +
      "[https://example.com/untitled](https://example.com/untitled)\n\n" +
      "[Daily News](https://news.example.com/)";

    expect(payload.rendered!.text).toBe(expected);
    expect(payload.rendered!.html).toBeUndefined();
  });

  it("url: byte-exact golden, no html channel", () => {
    const { payload } = runPipeline(singleWindowSnapshot, "window-tabs", "url");

    // url format: tab.url ; tabDelimiter "\n" ; no windowStart in tab scope
    const expected =
      "https://example.com/page\n" +
      "https://example.com/untitled\n" +
      "https://news.example.com/";

    expect(payload.rendered!.text).toBe(expected);
    expect(payload.rendered!.html).toBeUndefined();
  });

  it("link: text channel is url-fallback (same as url golden); html channel present with anchor tags", () => {
    const { payload } = runPipeline(singleWindowSnapshot, "window-tabs", "link");

    // link text channel delegates to the "url" fallback — same as url golden above
    const expectedText =
      "https://example.com/page\n" +
      "https://example.com/untitled\n" +
      "https://news.example.com/";

    // link html channel: anchorTagHtml = `<a href="url">encodeHtml(title || url)</a>`
    // normalTab:   <a href="https://example.com/page">Example Page</a>
    // untitledTab: title="" → fallback encodeHtml(tab.url) → <a href="https://example.com/untitled">https://example.com/untitled</a>
    // pinnedTab:   <a href="https://news.example.com/">Daily News</a>
    // tabDelimiter: "<br>\n"  (no windowStart in tab scope)
    const expectedHtml =
      '<a href="https://example.com/page">Example Page</a><br>\n' +
      '<a href="https://example.com/untitled">https://example.com/untitled</a><br>\n' +
      '<a href="https://news.example.com/">Daily News</a>';

    expect(payload.rendered!.text).toBe(expectedText);
    expect(payload.rendered!.html).toBe(expectedHtml);
    // url format has no html; link format does — assert the distinction explicitly
    expect(payload.rendered!.html).toBeDefined();
  });

  it("url format has no html property; link format does", () => {
    const { payload: urlPayload } = runPipeline(singleWindowSnapshot, "window-tabs", "url");
    const { payload: linkPayload } = runPipeline(singleWindowSnapshot, "window-tabs", "link");

    expect(urlPayload.rendered!.html).toBeUndefined();
    expect(linkPayload.rendered!.html).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// § WINDOW SCOPE — all-windows-and-tabs on multiWindowSnapshot
//
// multiWindowSnapshot.windows = [windowA(id=200), windowB(id=201)]
// windowA.tabs = [normalTab, bracketTitleTab]
// windowB.tabs = [aboutBlankTab, chromeExtensionsTab, tabWithFavIcon, tabWithoutFavIcon]
// All tabs have non-empty urls and none are pinned → all pass keepTab(…, true).
// ---------------------------------------------------------------------------

describe("e2e — WINDOW scope (all-windows-and-tabs, multiWindowSnapshot)", () => {
  it("payload.scope is 'window' with two window groups", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );

    expect(payload.scope).toBe("window");
    if (payload.scope !== "window") throw new Error("narrowing");

    // Two windows, two groups
    expect(payload.windows).toHaveLength(2);
    expect(payload.windows[0]!.windowSeq).toBe(1);
    expect(payload.windows[1]!.windowSeq).toBe(2);
  });

  it("windows[0] has 2 entries (windowA), windows[1] has 4 entries (windowB)", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );
    if (payload.scope !== "window") throw new Error("narrowing");

    expect(payload.windows[0]!.entries).toHaveLength(2);
    expect(payload.windows[1]!.entries).toHaveLength(4);
  });

  it("flattened entries[] has 6 total (2 + 4)", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );
    if (payload.scope !== "window") throw new Error("narrowing");

    expect(payload.entries).toHaveLength(6);
  });

  it("globalSeq is continuous (1–6 across both windows)", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );
    if (payload.scope !== "window") throw new Error("narrowing");

    const seqs = payload.entries.map((e) => e.globalSeq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("markdown rendered.text contains Window 1 and Window 2 headers in order", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );

    const text = payload.rendered!.text;
    const w1Pos = text.indexOf("## Window 1");
    const w2Pos = text.indexOf("## Window 2");

    expect(w1Pos).toBeGreaterThanOrEqual(0);
    expect(w2Pos).toBeGreaterThanOrEqual(0);
    expect(w1Pos).toBeLessThan(w2Pos);
  });

  it("markdown: byte-exact golden across both windows", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "markdown",
    );

    // Window 1 (windowA) tabs:
    //   normalTab:      [Example Page](https://example.com/page)
    //   bracketTitleTab: title="Re[mix] (Original)", url="https://remix.example.com/(track)"
    //     title: [ → \[, ] → \] → "Re\[mix\] (Original)"
    //     url:   ( → \(, ) → \) → "https://remix.example.com/\(track\)"
    //     → [Re\[mix\] (Original)](https://remix.example.com/\(track\))
    //
    // Window 2 (windowB) tabs:
    //   aboutBlankTab:        [New Tab](about:blank)
    //   chromeExtensionsTab:  [Extensions](chrome://extensions)
    //   tabWithFavIcon:       [Has Icon](https://icon.example.com/)
    //   tabWithoutFavIcon:    [No Icon](https://noicon.example.com/)
    //
    // windowStart: "## Window N\n\n", tabDelimiter: "\n\n", windowDelimiter: "\n\n"
    const expected =
      "## Window 1\n\n" +
      "[Example Page](https://example.com/page)\n\n" +
      "[Re\\[mix\\] (Original)](https://remix.example.com/\\(track\\))\n\n" +
      "## Window 2\n\n" +
      "[New Tab](about:blank)\n\n" +
      "[Extensions](chrome://extensions)\n\n" +
      "[Has Icon](https://icon.example.com/)\n\n" +
      "[No Icon](https://noicon.example.com/)";

    expect(payload.rendered!.text).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// § favIconUrl carriage into TabRecord
// ---------------------------------------------------------------------------

describe("e2e — favIconUrl in TabRecord entries", () => {
  it("tabWithFavIcon carries favIconUrl into its TabRecord entry", () => {
    // Use all-windows-and-tabs / multiWindowSnapshot: windowB contains tabWithFavIcon
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "url",
    );
    if (payload.scope !== "window") throw new Error("narrowing");

    // windowB is window index 1 (windowSeq=2); tabWithFavIcon is the 3rd tab in windowB
    const windowBEntries = payload.windows[1]!.entries;
    const favEntry = windowBEntries.find((e) => e.url === tabWithFavIcon.url);

    expect(favEntry).toBeDefined();
    expect(favEntry!.favIconUrl).toBe(tabWithFavIcon.favIconUrl);
  });

  it("tabWithoutFavIcon has no favIconUrl on its TabRecord entry", () => {
    const { payload } = runPipeline(
      multiWindowSnapshot,
      "all-windows-and-tabs",
      "url",
    );
    if (payload.scope !== "window") throw new Error("narrowing");

    const windowBEntries = payload.windows[1]!.entries;
    const noFavEntry = windowBEntries.find((e) => e.url === tabWithoutFavIcon.url);

    expect(noFavEntry).toBeDefined();
    expect(noFavEntry!.favIconUrl).toBeUndefined();
  });

  it("normalTab (in tab scope) carries favIconUrl", () => {
    // Use window-tabs on singleWindowSnapshot: normalTab is the first tab
    const { payload } = runPipeline(singleWindowSnapshot, "window-tabs", "url");

    expect(payload.scope).toBe("tab");
    if (payload.scope !== "tab") throw new Error("narrowing");

    const entry = payload.entries.find((e) => e.url === normalTab.url);
    expect(entry).toBeDefined();
    expect(entry!.favIconUrl).toBe(normalTab.favIconUrl);
  });

  it("untitledTab (in tab scope) has no favIconUrl", () => {
    const { payload } = runPipeline(singleWindowSnapshot, "window-tabs", "url");

    if (payload.scope !== "tab") throw new Error("narrowing");

    // untitledTab has no favIconUrl in the fixture
    const entry = payload.entries.find((e) => e.url === "https://example.com/untitled");
    expect(entry).toBeDefined();
    expect(entry!.favIconUrl).toBeUndefined();
  });
});
