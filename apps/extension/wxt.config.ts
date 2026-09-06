import path from "node:path";
import { defineConfig } from "wxt";
import stylex from "@stylexjs/unplugin/vite";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";

const stylexPlugin = () => {
  const plugin = stylex({
    unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() },
    aliases: { "@/*": [path.join(process.cwd(), "*")] },
    lightningcssOptions: { targets: browserslistToTargets(browserslist("chrome >= 120")) },
    devMode: "css-only",
  });
  const origTransform = plugin.transform;
  return {
    ...plugin,
    transform(code: string, id: string) {
      const cleanId = id.split("?")[0] ?? "";
      if (!/\.[jt]sx?$/.test(cleanId) || cleanId.includes("node_modules")) {
        return null;
      }
      return origTransform?.call(this, code, id);
    },
    generateBundle(
      _opts: unknown,
      bundle: Record<string, { type?: string; source?: string | Uint8Array }>,
    ) {
      const collectCss = (plugin as Record<string, unknown>)["__stylexCollectCss"] as
        | (() => string)
        | undefined;
      const css = collectCss?.();
      if (!css) return;
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type === "asset" && fileName.endsWith(".css")) {
          const current =
            typeof asset.source === "string" ? asset.source : asset.source?.toString() || "";
          asset.source = current ? `${current}\n${css}` : css;
        }
      }
    },
  };
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    action: {
      default_title: "Tab Sorter",
    },
    commands: {
      "sort-default": {
        description: "Sort tabs using your default sort",
        suggested_key: {
          default: "Alt+Shift+S",
        },
      },
      "sort-by-domain": {
        description: "Sort tabs by domain",
      },
      "sort-by-title": {
        description: "Sort tabs A to Z",
        suggested_key: {
          default: "Alt+Shift+T",
        },
      },
      tidy: {
        description: "Tidy this window: sort and group tabs",
        suggested_key: {
          default: "Alt+Shift+Space",
        },
      },
      undo: {
        description: "Undo the last tidy or dedupe",
        suggested_key: {
          default: "Alt+Shift+Z",
        },
      },
    },
    description:
      "Sort and group the current window's tabs, or move matching tabs into a new window.",
    name: "Tab Sorter",
    permissions: ["tabs", "tabGroups", "storage", "contextMenus", "clipboardWrite"],
  },
  hooks: {
    "vite:build:extendConfig": (entrypoints, config) => {
      const isHtmlEntry = entrypoints.some((e) => e.type === "popup" || e.type === "options");
      if (isHtmlEntry) {
        config.plugins ??= [];
        config.plugins.unshift(stylexPlugin());
      }
    },
    "vite:devServer:extendConfig": (config) => {
      config.plugins ??= [];
      config.plugins.unshift(stylexPlugin());
    },
  },
});
