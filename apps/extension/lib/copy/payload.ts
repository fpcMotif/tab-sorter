import { buildEntries } from "./entries.ts";
import type { CopyPayload, Rendered, ScopeSelection, TabRecord } from "./types.ts";

export function buildPayload(selection: ScopeSelection, rendered?: Rendered): CopyPayload {
  const entries = buildEntries(selection);

  if (selection.scope === "tab") {
    return { scope: "tab", entries, ...(rendered === undefined ? null : { rendered }) };
  }

  // Group the flattened entries back by windowSeq; empty windows produce no
  // group because they contribute no entries (mirrors donor empty-window drop).
  const groups = new Map<number, TabRecord[]>();
  for (const entry of entries) {
    const seq = entry.windowSeq;
    if (seq === undefined) {
      continue;
    }
    const list = groups.get(seq) ?? [];
    list.push(entry);
    groups.set(seq, list);
  }

  const windows = [...groups.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([windowSeq, windowEntries]) => ({ windowSeq, entries: windowEntries }));

  return {
    scope: "window",
    windows,
    entries,
    ...(rendered === undefined ? null : { rendered }),
  };
}
