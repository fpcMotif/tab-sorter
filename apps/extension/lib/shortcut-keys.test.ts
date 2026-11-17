import { describe, expect, it } from "vitest";

import { shortcutKeys, shortcutText } from "./shortcut-keys";

describe("shortcut key labels", () => {
  it("uses Option and Shift glyphs on macOS", () => {
    expect(shortcutKeys("MacIntel", "T")).toEqual(["⌥", "⇧", "T"]);
    expect(shortcutText("MacIntel", "T")).toBe("⌥⇧T");
  });

  it("spells out Alt and Shift on other platforms", () => {
    expect(shortcutKeys("Win32", "Space")).toEqual(["Alt", "Shift", "Space"]);
    expect(shortcutText("Linux x86_64", "Z")).toBe("Alt+Shift+Z");
  });
});
