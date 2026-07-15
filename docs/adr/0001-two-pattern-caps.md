# ADR-0001: Two pattern caps — matching safety vs storage quota

- **Status:** Accepted
- **Date:** 2026-06-21
- **Origin:** architecture review, deepening candidate "One pattern surface in `match`"

## Context

A user-supplied regex flows through three sites: the popup live preview, the
options preset form, and `runExtract`. Two different length bounds were applied to
that one input, with two different values:

- the popup capped the source at **1000** characters;
- the options preset form capped it at **500**;
- `runExtract` applied **no** cap at all.

Read quickly, `1000` vs `500` looks like duplication — an architecture review (this
one included, in its first pass) is tempted to unify them into a single constant.

## Decision

Keep **two** caps, because they answer two different questions.

- **The match safety cap** — `MATCH_SAFETY_CAP` (1000), owned by `lib/match.ts`. It
  is a ReDoS/backtracking bound: a source longer than this is refused before the
  regex is ever run, capping the cost of `.test()` across every tab. It belongs to
  `match` because `match` is what runs the pattern, and it applies to **every**
  matching path — popup preview and extraction alike. This closes the previously
  unbounded `runExtract` regex path.
- **The preset storage cap** — `MAX_PRESET_SOURCE_LENGTH` (500), owned by the
  options page. It is a `chrome.storage.sync` quota bound: presets are persisted,
  up to 50 of them, and must stay well under the ~8KB-per-item limit. It has nothing
  to do with whether a pattern is valid or safe to run.

The two caps must **not** be merged into one constant. `match` owns safety; the
persistence caller owns storage.

## Consequences

- Each cap stays honest to its own reason; neither has to compromise for the other.
- The extraction path is now bounded by the safety cap — a real fix, not just a
  refactor.
- A preset is checked against both caps. The storage cap (500) is always stricter
  than the safety cap (1000), so it fires first and the safety cap never rejects a
  preset — that ordering is intentional, not redundant.
- Two numbers to know instead of one. This ADR exists so future reviews don't
  re-suggest collapsing them.

> Postscript (2026-07-15): the preset storage cap now lives in lib/storage.ts — the persistence module; still deliberately separate from MATCH_SAFETY_CAP.
