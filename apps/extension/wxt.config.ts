import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tab Sorter",
    description: "Sort, extract, and export your browser tabs",
    permissions: ["tabs", "storage", "contextMenus", "commands"],
    commands: {
      "sort-by-title": {
        suggested_key: {
          default: "Alt+Shift+T",
        },
        description: "Sort current window tabs A→Z by title",
      },
      "sort-by-domain": {
        suggested_key: {
          default: "Alt+Shift+D",
        },
        description: "Sort current window tabs by domain",
      },
    },
  },
});
