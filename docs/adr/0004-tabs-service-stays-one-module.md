# ADR-0004: tabs-service stays one module

- **Status:** Accepted
- **Date:** 2026-07-17
- **Origin:** Iteration 2 of the architecture loop. A pattern-catalog review (PoEAA) read
  `tabs-service.ts` as "three patterns forced into one file" — Gateway reads, Memento-style
  snapshot, phased executor — and prescribed a Finder/Gateway split.

## Decision

Rejected. `tabs-service.ts` remains one module.

## Reasoning

The pattern taxonomy is accurate; the split still fails the deletion test in this codebase:

1. **No interface shrinks.** `orchestration.ts` is the only importer and would import the
   same 8 symbols whether they live in one file or three. A caller must know exactly as
   much after the split as before.
2. **It widens the surface.** `RawTab`, `toTabLite`, `getLiveStrip`, `asNonEmpty` are
   file-private today. Splitting forces them into cross-module exports — a hidden seam
   becomes a published one. That is the opposite of deepening.
3. **One reason to change.** Reads, snapshot, and executor all change for the same reason:
   the `chrome.tabs`/`tabGroups` contract changed. Three pattern names, one responsibility,
   one client. The hard math already left the module (ADR-0003).

## Revisit when

A second real client of the browser boundary appears — e.g. the roadmap's CLI/MCP
producers realize plans through a different transport, or a second adapter is needed at
this seam. Two adapters make the seam real; one keeps it hypothetical.
