import { describe, expect, it } from "vitest";

import {
  aboutBlankTab,
  bracketTitleTab,
  chromeExtensionsTab,
  emptySnapshot,
  multiWindowSnapshot,
  normalTab,
  pinnedTab,
  singleWindowSnapshot,
  tabWithFavIcon,
  tabWithoutFavIcon,
  untitledTab,
  windowA,
  windowB,
} from "./tabs.ts";

describe("tab fixtures", () => {
  it("untitledTab has an empty title", () => {
    expect(untitledTab.title).toBe("");
    expect(untitledTab.url).toBeTruthy();
  });

  it("normalTab has a favIconUrl", () => {
    expect(normalTab.favIconUrl).toBeTruthy();
  });

  it("aboutBlankTab has special scheme url", () => {
    expect(aboutBlankTab.url).toBe("about:blank");
  });

  it("chromeExtensionsTab has chrome:// url", () => {
    expect(chromeExtensionsTab.url).toBe("chrome://extensions");
  });

  it("pinnedTab is pinned", () => {
    expect(pinnedTab.pinned).toBe(true);
  });

  it("tabWithFavIcon has favIconUrl; tabWithoutFavIcon does not", () => {
    expect(tabWithFavIcon.favIconUrl).toBeTruthy();
    expect(tabWithoutFavIcon.favIconUrl).toBeUndefined();
  });

  it("bracketTitleTab exercises the [title](url) Markdown-escape hazard", () => {
    // [ ] in the title and ( ) in the url are the chars Markdown link syntax
    // must escape — this fixture is the input for those golden tests.
    expect(bracketTitleTab.title).toMatch(/\[/);
    expect(bracketTitleTab.url).toMatch(/\(/);
  });
});

describe("window fixtures", () => {
  it("windowA and windowB have distinct ids", () => {
    expect(windowA.id).not.toBe(windowB.id);
  });
});

describe("snapshot fixtures", () => {
  it("singleWindowSnapshot has one window of three tabs", () => {
    expect(singleWindowSnapshot.windows).toHaveLength(1);
    // Pin the tab count so downstream count expectations don't drift silently.
    expect(singleWindowSnapshot.windows[0]!.tabs).toHaveLength(3);
  });

  it("multiWindowSnapshot has two windows", () => {
    expect(multiWindowSnapshot.windows).toHaveLength(2);
  });

  it("emptySnapshot has no windows and no highlighted tabs", () => {
    expect(emptySnapshot.windows).toHaveLength(0);
    expect(emptySnapshot.highlightedTabIds).toHaveLength(0);
  });
});
