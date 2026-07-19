# ADR-0001: Two pattern caps — matching safety vs storage quota

- **Status:** Accepted
- **Date:** 2026-06-21
- **Origin:** architecture review, deepening candidate "One pattern surface in `match`"

## Context

A user-supplied regex flows through three sites: the popup live preview, the
options preset form, and `runExtract`. One input, two length bounds, two values:

- the popup capped the source at **1000** characters;
- the options preset form capped it at **500**;
- `runExtract` applied **no** cap at all.

Read quickly, `1000` vs `500` looks like duplication. An architecture review — this
one included, first pass — is tempted to unify them into one constant.

## Decision

Keep **two** caps. They answer two different questions.

- **The match safety cap** — `MATCH_SAFETY_CAP` (1000), owned by `lib/match.ts`. A
  ReDoS/backtracking bound: a longer source is refused before the regex runs, capping
  `.test()` cost across every tab. It belongs to `match` because `match` runs the
  pattern, and it applies to **every** matching path — popup preview and extraction
  alike. This closes the previously unbounded `runExtract` regex path.
- **The preset storage cap** — `MAX_PRESET_SOURCE_LENGTH` (500), owned by the
  options page. A `chrome.storage.sync` quota bound: up to 50 presets are persisted
  and must stay well under the ~8KB-per-item limit. It says nothing about whether a
  pattern is valid or safe to run.

Do **not** merge the two into one constant. `match` owns safety; the persistence
caller owns storage.

## Consequences

- Each cap stays honest to its own reason; neither compromises for the other.
- The extraction path is now bounded by the safety cap — a real fix, not just a
  refactor.
- A preset is checked against both caps. The storage cap (500) is always stricter
  than the safety cap (1000), so it fires first and the safety cap never rejects a
  preset. That ordering is intentional, not redundant.
- Two numbers to know instead of one. This ADR exists so future reviews don't
  re-suggest collapsing them.
