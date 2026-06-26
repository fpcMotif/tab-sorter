import type {
  ScopeId,
  ScopeSelection,
  ScopeSnapshot,
  TabLite,
  WindowLite,
} from "./types.ts";

function hasUrl(tab: TabLite): boolean {
  return typeof tab.url === "string" && tab.url.length > 0;
}

// Mirrors the donor's pinned filter: includePinned === true means no filter
// (donor `filter === undefined`); false means `({ pinned }) => !pinned`.
function passesPinned(tab: TabLite, includePinned: boolean): boolean {
  return includePinned || !tab.pinned;
}

function keepTab(tab: TabLite, includePinned: boolean): boolean {
  return hasUrl(tab) && passesPinned(tab, includePinned);
}

function currentWindow(snapshot: ScopeSnapshot): WindowLite | undefined {
  return snapshot.windows.find((win) => win.id === snapshot.currentWindowId);
}

export function selectScope(
  snapshot: ScopeSnapshot,
  scopeId: ScopeId,
  includePinned: boolean,
): ScopeSelection {
  switch (scopeId) {
    case "highlighted-tabs": {
      // Pinned-immune: donor filters url-only tabs, then by highlighted — the
      // pinned filter is never applied to this scope.
      const highlighted = new Set(snapshot.highlightedTabIds);
      const win = currentWindow(snapshot);
      const tabs = (win?.tabs ?? []).filter(
        (tab) => highlighted.has(tab.id) && hasUrl(tab),
      );
      return { scope: "tab", tabs };
    }
    case "window-tabs": {
      const win = currentWindow(snapshot);
      const tabs = (win?.tabs ?? []).filter((tab) =>
        keepTab(tab, includePinned),
      );
      return { scope: "tab", tabs };
    }
    case "all-tabs": {
      const tabs = snapshot.windows.flatMap((win) =>
        win.tabs.filter((tab) => keepTab(tab, includePinned)),
      );
      return { scope: "tab", tabs };
    }
    case "all-windows-and-tabs": {
      const windows = snapshot.windows
        .map((win) => ({
          id: win.id,
          tabs: win.tabs.filter((tab) => keepTab(tab, includePinned)),
        }))
        .filter((win) => win.tabs.length > 0);
      return { scope: "window", windows };
    }
  }
}
