import { getDomain } from "@/lib/domain";
import { runDefaultSort, runExtract, runSort, runTidy, runUndo } from "@/lib/orchestration";

interface MenuClickInfo {
  menuItemId: string | number;
  pageUrl?: string;
}

interface ClickedTab {
  url?: string;
}

interface MenuItem {
  id: string;
  title: string;
  // `url` is only ever populated from a context-menu click (a page to derive
  // a domain from); commands never supply one.
  run(ctx: { url?: string }): Promise<unknown>;
}

const EXTRACT_SITE_ID = "extract-site";

// Single table driving both the context menu (all six items, created in this
// order) and the two command dispatchers below. wxt.config.ts registers only
// five keyboard commands — extract-site needs a page url a shortcut can't
// supply — so handleCommand excludes it explicitly rather than relying on
// the manifest to never produce that id.
const MENU_ITEMS: MenuItem[] = [
  { id: "tidy", title: "Tidy this window", run: () => runTidy() },
  { id: "sort-default", title: "Sort tabs (your default)", run: () => runDefaultSort() },
  { id: "sort-by-title", title: "Sort tabs A to Z", run: () => runSort("title") },
  { id: "sort-by-domain", title: "Sort tabs by domain", run: () => runSort("domain") },
  {
    id: EXTRACT_SITE_ID,
    title: "Extract this site to new window",
    run: (ctx) => {
      if (ctx.url === undefined) {
        return Promise.resolve(undefined);
      }

      return runExtract({ type: "domain", domain: getDomain(ctx.url) });
    },
  },
  { id: "undo", title: "Undo last tidy", run: () => runUndo() },
];

async function setupContextMenus(): Promise<void> {
  await browser.contextMenus.removeAll();

  for (const item of MENU_ITEMS) {
    browser.contextMenus.create({ contexts: ["page"], id: item.id, title: item.title });
  }
}

async function handleCommand(command: string): Promise<void> {
  const item = MENU_ITEMS.find((entry) => entry.id === command);

  if (item === undefined || item.id === EXTRACT_SITE_ID) {
    return;
  }

  await item.run({});
}

async function handleContextMenu(info: MenuClickInfo, tab: ClickedTab | undefined): Promise<void> {
  const item = MENU_ITEMS.find((entry) => entry.id === info.menuItemId);

  if (item === undefined) {
    return;
  }

  await item.run({ url: tab?.url ?? info.pageUrl });
}

export default defineBackground(() => {
  // Run once on every service-worker startup so the menus also reappear after a
  // mid-session disable/re-enable (which fires neither onInstalled nor onStartup).
  // removeAll() inside makes this idempotent.
  //
  // These actions have no UI to surface failures, so we let any rejection
  // propagate as an unhandled rejection: the runtime records it against the
  // service worker (chrome://extensions and the worker DevTools console)
  // without us owning a logging side effect here.
  void setupContextMenus();

  browser.runtime.onInstalled.addListener(() => {
    void setupContextMenus();
  });
  browser.runtime.onStartup.addListener(() => {
    void setupContextMenus();
  });
  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab);
  });
});
