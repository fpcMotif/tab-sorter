import { describe, expect, it } from "vitest";

import { planWindowOrder } from "./plan";
import type { TabLite } from "./types";

function tab(id: number, title: string, url: string, pinned = false): TabLite {
  return { id, title, url, index: id, pinned };
}

describe("planWindowOrder", () => {
  it("freezes the pinned block at the front and sorts unpinned A→Z by title", () => {
    const tabs = [
      tab(9, "Pinned", "https://pinned.example", true),
      tab(2, "Beta", "https://github.com/b"),
      tab(1, "Alpha", "https://docs.example.com/a"),
    ];

    expect(planWindowOrder(tabs, "title", true)).toEqual([9, 1, 2]);
  });

  it("sorts unpinned by domain then title, pinned untouched, when ignorePinned", () => {
    const tabs = [
      tab(9, "Pinned", "https://pinned.example", true),
      tab(2, "Beta", "https://github.com/b"),
      tab(1, "Alpha", "https://docs.example.com/a"),
    ];

    expect(planWindowOrder(tabs, "domain", true)).toEqual([9, 1, 2]);
  });

  it("sorts pinned within their own region without interleaving unpinned", () => {
    const tabs = [
      tab(1, "Zed", "https://zed.example", true),
      tab(2, "Ace", "https://ace.example", true),
      tab(3, "Mid", "https://mid.example"),
    ];

    expect(planWindowOrder(tabs, "title", false)).toEqual([2, 1, 3]);
  });

  it("keeps the original pinned order when ignorePinned, even if mis-sorted", () => {
    const tabs = [
      tab(1, "Zed", "https://zed.example", true),
      tab(2, "Ace", "https://ace.example", true),
      tab(3, "Mid", "https://mid.example"),
    ];

    expect(planWindowOrder(tabs, "title", true)).toEqual([1, 2, 3]);
  });

  it("never floats a pinned tab past the unpinned block (pinned always first)", () => {
    const tabs = [
      tab(2, "zzz unpinned", "https://z.example"),
      tab(1, "aaa pinned", "https://a.example", true),
    ];

    // Title-wise "aaa" < "zzz", but the pinned id must stay at index 0.
    expect(planWindowOrder(tabs, "title", false)).toEqual([1, 2]);
  });

  it("sorts an all-pinned window within the pinned region", () => {
    const tabs = [
      tab(5, "Bravo", "https://b.example", true),
      tab(4, "Alpha", "https://a.example", true),
    ];

    expect(planWindowOrder(tabs, "title", false)).toEqual([4, 5]);
    expect(planWindowOrder(tabs, "title", true)).toEqual([5, 4]);
  });

  it("returns a single id unchanged and an empty window as empty", () => {
    expect(planWindowOrder([tab(7, "Solo", "https://solo.example")], "title", true)).toEqual([7]);
    expect(planWindowOrder([], "domain", true)).toEqual([]);
  });
});
