/**
 * Deterministic shared fixtures for the Tab Copy engine test suite.
 * Pure data — no chrome.*, no I/O. Built only from Module A types.
 * Imported by scope, render, entries, and format golden tests.
 */
import type { ScopeSnapshot, TabLite, WindowLite } from "../types.ts";

// ---------------------------------------------------------------------------
// Individual tab fixtures
// ---------------------------------------------------------------------------

/** A tab with no title (empty string) — tests "(untitled)" fallbacks. */
export const untitledTab: TabLite = {
  id: 1,
  url: "https://example.com/untitled",
  title: "",
  index: 0,
  pinned: false,
};

/** A normal, fully-populated tab. */
export const normalTab: TabLite = {
  id: 2,
  url: "https://example.com/page",
  title: "Example Page",
  index: 1,
  pinned: false,
  favIconUrl: "https://example.com/favicon.ico",
};

/** A tab with a special-scheme URL (about:blank). */
export const aboutBlankTab: TabLite = {
  id: 3,
  url: "about:blank",
  title: "New Tab",
  index: 2,
  pinned: false,
};

/** A tab with a chrome:// URL. */
export const chromeExtensionsTab: TabLite = {
  id: 4,
  url: "chrome://extensions",
  title: "Extensions",
  index: 3,
  pinned: false,
};

/** A pinned tab. */
export const pinnedTab: TabLite = {
  id: 5,
  url: "https://news.example.com/",
  title: "Daily News",
  index: 0,
  pinned: true,
  favIconUrl: "https://news.example.com/favicon.ico",
};

/** A tab with a favIconUrl set. */
export const tabWithFavIcon: TabLite = {
  id: 6,
  url: "https://icon.example.com/",
  title: "Has Icon",
  index: 1,
  pinned: false,
  favIconUrl: "https://icon.example.com/icon.png",
};

/** A tab without a favIconUrl (undefined). */
export const tabWithoutFavIcon: TabLite = {
  id: 7,
  url: "https://noicon.example.com/",
  title: "No Icon",
  index: 2,
  pinned: false,
};

/**
 * A tab whose title contains brackets [ ] and parentheses ( ).
 * Tests Markdown escaping of special link-syntax characters.
 */
export const bracketTitleTab: TabLite = {
  id: 8,
  url: "https://remix.example.com/(track)",
  title: "Re[mix] (Original)",
  index: 3,
  pinned: false,
};

// ---------------------------------------------------------------------------
// Window fixtures
// ---------------------------------------------------------------------------

/** A single window with a normal mix of tabs. */
export const singleWindow: WindowLite = {
  id: 100,
  tabs: [normalTab, untitledTab, pinnedTab],
};

/** Window A for multi-window scenarios. */
export const windowA: WindowLite = {
  id: 200,
  tabs: [normalTab, bracketTitleTab],
};

/** Window B for multi-window scenarios — contains special-scheme tabs. */
export const windowB: WindowLite = {
  id: 201,
  tabs: [aboutBlankTab, chromeExtensionsTab, tabWithFavIcon, tabWithoutFavIcon],
};

// ---------------------------------------------------------------------------
// ScopeSnapshot fixtures
// ---------------------------------------------------------------------------

/** Sentinel id for a snapshot with no active window. */
const NO_CURRENT_WINDOW = 0;

/** A snapshot with a single window. */
export const singleWindowSnapshot: ScopeSnapshot = {
  windows: [singleWindow],
  currentWindowId: 100,
  highlightedTabIds: [normalTab.id],
};

/** A snapshot spanning two windows (windowA is current). */
export const multiWindowSnapshot: ScopeSnapshot = {
  windows: [windowA, windowB],
  currentWindowId: 200,
  highlightedTabIds: [normalTab.id, bracketTitleTab.id],
};

/** An empty snapshot — no windows, no tabs. */
export const emptySnapshot: ScopeSnapshot = {
  windows: [],
  currentWindowId: NO_CURRENT_WINDOW,
  highlightedTabIds: [],
};
