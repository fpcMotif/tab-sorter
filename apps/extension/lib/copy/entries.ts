import { getDomain } from "@/lib/domain.ts";
import { enumerateSelection } from "./render.ts";
import type { ScopeSelection, TabLite, TabRecord } from "./types.ts";

function toRecord(
  tab: TabLite,
  globalSeq: number,
  windowSeq?: number,
  windowTabSeq?: number,
): TabRecord {
  return {
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    domain: getDomain(tab.url),
    pinned: tab.pinned,
    index: tab.index,
    ...(windowSeq === undefined ? null : { windowSeq }),
    ...(windowTabSeq === undefined ? null : { windowTabSeq }),
    globalSeq,
  };
}

export function buildEntries(selection: ScopeSelection): TabRecord[] {
  const entries: TabRecord[] = [];
  for (const { tab, globalSeq, windowSeq, windowTabSeq } of enumerateSelection(selection)) {
    entries.push(toRecord(tab, globalSeq, windowSeq, windowTabSeq));
  }
  return entries;
}
