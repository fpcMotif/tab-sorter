import { getDomain } from "@/lib/domain";
import { runExtract, runSort } from "@/lib/orchestration";

const MENU_IDS = {
  extractSite: "extract-site",
  sortByDomain: "sort-by-domain",
  sortByTitle: "sort-by-title",
} as const;

interface MenuClickInfo {
  menuItemId: string | number;
  pageUrl?: string;
}

interface ClickedTab {
  url?: string;
}

async function setupContextMenus(): Promise<void> {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.sortByTitle,
    title: "Sort tabs A to Z",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.sortByDomain,
    title: "Sort tabs by domain",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.extractSite,
    title: "Extract this site to new window",
  });
}

async function handleCommand(command: string): Promise<void> {
  if (command === MENU_IDS.sortByTitle) {
    await runSort("title");
    return;
  }

  if (command === MENU_IDS.sortByDomain) {
    await runSort("domain");
  }
}

async function handleContextMenu(info: MenuClickInfo, tab: ClickedTab | undefined): Promise<void> {
  if (info.menuItemId === MENU_IDS.sortByTitle) {
    await runSort("title");
    return;
  }

  if (info.menuItemId === MENU_IDS.sortByDomain) {
    await runSort("domain");
    return;
  }

  if (info.menuItemId === MENU_IDS.extractSite) {
    const url = tab?.url ?? info.pageUrl;

    if (url !== undefined) {
      await runExtract({ type: "domain", domain: getDomain(url) });
    }
  }
}

function reportBackgroundError(error: unknown): void {
  console.error("Tab Sorter background action failed", error);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void setupContextMenus().catch(reportBackgroundError);
  });
  browser.runtime.onStartup.addListener(() => {
    void setupContextMenus().catch(reportBackgroundError);
  });
  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command).catch(reportBackgroundError);
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab).catch(reportBackgroundError);
  });
});
