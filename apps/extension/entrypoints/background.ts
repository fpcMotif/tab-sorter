import { runExtract, runSort } from "@/lib/orchestration.ts";
import { getDomain } from "@/lib/domain.ts";
import type { SortMode } from "@/lib/types.ts";

const SORT_COMMANDS: Record<string, SortMode> = {
  "sort-by-title": "title",
  "sort-by-domain": "domain",
};

export default defineBackground(() => {
  chrome.commands.onCommand.addListener((command) => {
    const mode = SORT_COMMANDS[command];
    if (mode) {
      void runSort(mode);
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "sort-by-title") {
      void runSort("title");
      return;
    }

    if (info.menuItemId === "sort-by-domain") {
      void runSort("domain");
      return;
    }

    if (info.menuItemId === "extract-this-site" && tab?.url) {
      const domain = getDomain(tab.url);
      void runExtract({ type: "domain", domain });
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "sort-by-title",
      title: "Sort tabs A→Z",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "sort-by-domain",
      title: "Sort tabs by domain",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "extract-this-site",
      title: "Extract this site to a new window",
      contexts: ["page"],
    });
  });
});
