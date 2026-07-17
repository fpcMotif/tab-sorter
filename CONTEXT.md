# CONTEXT — Tab Sorter domain glossary

The shared language for the extension. Architecture vocabulary (module, interface,
seam, depth, adapter, leverage, locality) comes from the `/codebase-design` skill;
this file names the **domain**.

## Core nouns

- **TabLite** (`lib/types.ts`) — the trimmed tab the pure layer reasons about:
  `{ id, url, title, index, pinned }` plus an optional `groupId` (live tab-group id,
  `TAB_GROUP_NONE` when ungrouped — optional so plain-array test fixtures stay
  terse). The only shape `domain`/`sort`/`match`/`plan`/`tidy`/`dedupe`/`undo` ever
  see; the browser's `Tab` never leaks past `tabs-service`.
- **SortMode** — `"title"` (A→Z by page title) or `"domain"` (grouped by domain, then title).
- **DomainGroup** — `{ domain, count, tabIds }`; feeds the popup's clickable domain list. Built by
  `groupByDomain` in `lib/domain-groups.ts` (domain-bucketing of tabs), the sibling to `match.ts`'s
  pattern surface; `matchByDomain` (same module) resolves one bucket's ids for extraction.
- **Prefs** — `{ defaultSort, ignorePinned, regexPresets }` plus the Layer 1 tidy/dedupe knobs
  (`collapseAfterTidy`, `minGroupSize`, `groupOrder`, `regroupExisting`, `dedupeIgnoreHash`,
  `dedupeIgnoreQuery`), persisted in `chrome.storage.sync`.

## Ordering & the pinned boundary

- **Window order** — the absolute desired order of *every* tab id in the current window,
  a permutation of `tabs.map(t => t.id)`. The seam between pure planning and the
  side-effect adapter is this bare `number[]` — today the `order` field of a `TabPlan`
  (below), anchored at index 0.
- **planWindowOrder** (`lib/plan.ts`) — the one **pinned-aware** ordering rule, built on
  the pinned-agnostic primitives in `lib/sort.ts`. Owns the pinned-front invariant; its
  interface is the test surface (`lib/plan.test.ts`, plain arrays, no browser mock).
- **pinned-front invariant** — Chrome keeps pinned tabs as a contiguous block at the front
  of the window and **silently clamps** any move that would cross that boundary (no throw,
  no unpin, just a wrong permutation). Verified HIGH-confidence against the `chrome.tabs`
  contract.
- **never-interleave construction** — `[...pinnedOrder, ...sortFn(unpinned)]`: sort each
  region separately and concatenate pinned-first, so a comparator can never float a pinned
  id into the unpinned region. Makes the clamp bug structurally unrepresentable. **Must
  stay split forever** — collapsing to one comparator over all tabs reintroduces the bug;
  `lib/plan.test.ts` is the regression guard.
- **assemblePlan** (`lib/plan.ts`) — the one constructor that performs the never-interleave
  splice: `{ pinnedOrder, unpinnedTail, groups?, ungroup?, close? } → TabPlan`. Every producer
  (`planWindowOrder`, `planTidy`, `planUndo`) designates its own pinned region and unpinned
  tail (pre-concatenating any composite of its own, e.g. tidy's existing-blocks + new-groups +
  leftover); `assemblePlan` owns the single pinned-first concatenation, so the splice is typed
  once instead of re-typed at each producer.
- **ignorePinned** — when set, the pinned block keeps its current order (frozen); otherwise
  pinned tabs are sorted among themselves. Pinned ids always precede unpinned ids either way.

## Matching patterns

- **the pattern surface** (`lib/match.ts`) — the one public home for judging and running a
  user-supplied regex. Three **non-throwing** entry points, so validity is one rule everywhere:
  - **validatePattern** (`source`, `flags`) → **PatternVerdict** (`{ ok: true; regex }` |
    `{ ok: false; reason }`). Enforces the **match safety cap**, then compiles. The tabs-less
    verdict the `options` preset form reads before persisting.
  - **matchPattern** (`tabs`, `source`, `flags`) → **MatchResult** (`{ ok: true; ids }` |
    `{ ok: false; reason }`). Validates, then tests each tab's `title\nurl`. Shared by the popup
    preview (reads `ids.length`) and `runExtract` (moves `ids`); on a bad pattern `runExtract`
    is a no-op (`moved: 0`), since the popup gates extraction behind a valid preview.
  - **reasonToString** (`reason`) → string. The single home for the user-facing copy, so the
    popup and options can't drift.
- **PatternErrorReason** — `"pattern" | "flags" | "tooLong"`, the discriminant every caller
  reads. **compilePattern** is now an **internal** primitive behind `validatePattern`; it owns
  the **g/y-strip rule** (a reused `g`/`y` matcher advances `lastIndex` and would skip tabs) and
  the pattern-vs-flags probe. The g/y-strip rule is guarded as a *behaviour* test through
  `matchPattern`, not through the internal primitive.
- **match safety cap** (`MATCH_SAFETY_CAP`, 1000) — the one length bound every matching path
  inherits, capping regex backtracking (ReDoS) cost and closing the formerly-unbounded
  `runExtract` regex path. **Not** the same as the `options` preset's stricter storage cap (500,
  a `chrome.storage.sync` quota rule); the two are deliberately separate — see
  `docs/adr/0001-two-pattern-caps.md`. Cap, compilation, and preview all route through the
  pattern surface, so validity is judged by the same rule everywhere.

## Realizing an order

- **applyOrder (realize layer)** (`lib/tabs-service.ts`) — takes a window order, re-queries a
  fresh snapshot, drops vanished ids, and issues only the moves needed (computed by
  `planFlatMoves` in `lib/realize-order.ts`) using
  single-id `browser.tabs.move` calls (never the batch/array form, which has an off-by-one).
  Knows nothing about pinning; positioning against the live strip keeps each region in place
  and is immune to a stale boundary. Today it is the **fast path** `applyPlan`'s ORDER phase
  falls back to when nothing in the plan or the live window touches groups (see below).
- **planMoves / minimal-moves diff** (`lib/tab-moves.ts`) — pure internal helper of the realize
  layer (not on `applyOrder`'s interface). Keeps the longest run of already-in-order tabs (the
  LIS by target rank) fixed and relocates only the rest, so an almost-sorted window flickers a
  handful of tabs instead of all N. Proven correct and minimal (`moves == n − LIS`) over every
  permutation up to n=7 in `tab-moves.test.ts` (and up to n=14 by fuzz in `invariants.test.ts`).
- **changed-count** (`moved`) — the number of positions where the desired window order differs
  from the current id list, i.e. the true count of tabs whose index changes. What the popup
  toast reports — *not* the number of tabs considered, *not* the number of `move` calls issued.

## The TabPlan IR

- **TabPlan** (`lib/types.ts`) — the widened seam: `{ order, groups, ungroup, close }`.
  **order** is a permutation of the live unclosed tab ids, pinned-first (Window order,
  generalized); **empty `order` means "leave positions alone"** — dedupe only ever sets
  `close`, never touches position. **groups** is the desired `GroupSpec[]` (below).
  **ungroup** lists ids that must end ungrouped — the one channel by which a tab is pulled
  *out* of a group with no new group claiming it; membership moves *between* groups need no
  entry here, since a tab joins at most one group and `tabs.group()` implicitly drops it from
  any old one. **close** lists ids to remove. `runSort` is the degenerate, single-verb case —
  `{ order: desiredOrder, groups: [], ungroup: [], close: [] }` — so sort, tidy, dedupe, and
  undo all lower to the one realize path (`applyPlan`, below); see
  `docs/adr/0002-tabplan-realize.md`.
- **GroupSpec** (`lib/types.ts`) — `{ key, title, color, collapsed, tabIds }`. `tabIds` is a
  contiguous slice of `order` with no pinned ids (grouping silently unpins — the fact-checked
  gotcha below). `key` is the plan-local identity a producer picks: `planTidy` uses the domain,
  `planUndo` uses `g${groupId}`; the group reconciler (below) never needs a live `groupId`
  from a producer, only this stable key.
- **planTidy** (`lib/tidy.ts`) — the one producer that builds both `order` and `groups` from a
  bare tab list. Buckets ungrouped, unpinned tabs by `getDomain`; buckets below `minGroupSize`
  stay ungrouped leftovers; each surviving bucket is sorted by title (`sortByTitle`) and the
  buckets themselves ordered alpha or size-desc (`GroupOrder`). With `regroupExisting` off
  (default), an already-grouped tab's group is left an **untouched atomic block**, placed first
  among the unpinned region, and `ungroup` stays empty — tidy only ever claims *ungrouped*
  unpinned tabs. With it on, every unpinned tab is reclaimed and rebucketed by domain, dissolving
  old groups; a previously-grouped tab that lands as a leftover singleton is reported in
  `ungroup` (one absorbed into a *new* group needs no entry). **assignColor** (`lib/domain.ts` —
  the domain vocabulary: name + color) is a deterministic djb2-hash → 9-color palette lookup, so
  the same domain always gets the same swatch; collisions across >9 domains are expected and
  accepted, the title disambiguates.

## The group reconciler

- **planGroupOps** (`lib/group-ops.ts`) — the minimal-diff GROUP reconciler; `group-ops`'
  sibling to `planMoves`' philosophy, but for the GROUP axis. Turns the live `LiveGroup[]`
  Chrome already has into the ops needed to reach a desired `GroupSpec[]`, touching as little
  as possible. Each desired group is matched to **at most one** unclaimed live group by
  **overlap matching** — the live group sharing the most members with the desired group's
  `tabIds` (zero overlap never counts as a match, or an empty live group would "win" every
  comparison; ties break on lowest `groupId`) — so a perfect match emits **zero** ops, and a
  matched group only gets the members it's missing plus a metadata `update` if
  title/color/collapsed actually differs. An unmatched desired group gets a `create` then an
  `update` right after (a brand-new group has none of the desired metadata yet).
- **never-emits-ungroup invariant** — `planGroupOps` never produces an "ungroup" op.
  `TabPlan.ungroup` is the **only** owner of tabs that must end ungrouped; a tab leaving its
  matched live group is implicitly pulled out by whichever *other* desired group's `group` op
  claims it (`tabs.group()`'s adapter call moves membership, no explicit removal needed first).
  Guarded by `lib/group-ops.test.ts`'s conservation-invariant suite.

## Realizing a plan

- **applyPlan** (`lib/tabs-service.ts`) — realizes a `TabPlan` against the current window in
  four phases, always in this order: **UNGROUP** (`plan.ungroup`, one batch `tabs.ungroup`
  call) → **GROUPS** (`planGroupOps` reconciled and executed) → **ORDER** (skipped entirely
  when `order` is empty) → **CLOSE** (`plan.close`, one batch `tabs.remove` call). Each phase
  re-derives survivors from a fresh query, so a tab that vanishes mid-operation is silently
  dropped rather than corrupting a later phase's index math.
- **groups-before-order** — the load-bearing ordering constraint (see
  `docs/adr/0002-tabplan-realize.md`). `tabs.group()` auto-moves its members to be contiguous —
  Chrome unilaterally repositions tabs the moment you group them, the same kind of silent
  override as the pinned-front clamp above. Running GROUPS *after* ORDER would let that
  auto-move undo whatever position ORDER had just carefully set; running GROUPS first means
  every group is already one relocatable span by the time ORDER's block model queries the strip.
- **the block model** (`planBlockMoves`, `lib/realize-order.ts`) — the **pure planner** that
  computes `plan.order`'s move script as three passes: (a) the pinned region via `planMoves` (its
  region-relative index is already the absolute one — pinned tabs are always the window's
  contiguous front block); (b) fix each live group's *internal* member order via `planMoves`
  scoped to the group's own span, before it moves as a whole — `tabGroups.move` carries members
  along in their current relative order, so getting that order right first means the group needs
  only one relocating move; (c) walk the desired unpinned sequence left to right, relocating each
  top-level block — a group (one `tabGroups.move`, spanning its full LIVE membership even if
  `plan.order` doesn't mention every member) or an ungrouped singleton (`tabs.move`) — into place.
  `runOrder`/`applyPlan` (`lib/tabs-service.ts`) is now the **replaying executor** — one browser
  call per emitted `RealizeMove`, in order; phase ordering stays owned by the executor
  (`docs/adr/0003-realize-order-pure-planner.md`). **Fast path**: when nothing in the plan or the
  live window touches groups, this degenerates to `planFlatMoves` (the fast-path translation)
  instead of re-deriving the same result the slow way.
- **vanished (count)** — the number of DISTINCT plan-referenced ids `applyPlan` observed missing
  from a phase's *own* fresh live query: a tab the plan named that had already closed out from
  under the action before that phase ran. Each phase returns the ids it saw absent (UNGROUP: ids
  gone from the strip, distinct from *already-ungrouped* survivors it also skips; GROUPS: ids
  filtered out as non-survivors — a **pinned** id excluded by policy is *not* vanished, the
  grouping-unpins exclusion is deliberate, not a disappearance; ORDER: `order` ids absent from the
  strip, counted on the fast path too; CLOSE: `close` ids absent from the live query) and
  `applyPlan` **unions** them, so an id gone for two phases counts once. Detection only — the same
  silent drops the four phases already make, now *counted*: no browser-call sequence changes and a
  vanished id is still dropped, never chased. Threaded into each realizing action's result
  (`SortResult`/`TidyResult`/`DedupeResult`/`UndoResult`) and appended to that action's success
  toast (" · N closed mid-action") when non-zero — except dedupe, whose clause is " · N gone
  already": its messages already end in "closed", and a vanished dedupe target is simply a
  duplicate that's already gone. `runExtract` never realizes a plan, so it carries no vanished
  count. Deliberately **not** surfaced by `background.ts` (hotkey/menu actions have no toast).

## The realize-order planner (pure move script — ADR-0003)

Split-Phase result of `docs/adr/0003-realize-order-pure-planner.md`: the ORDER math is a **pure
planner** (`lib/realize-order.ts`) that emits a move script from an in-memory strip simulation,
and the executor in `tabs-service.ts` replays it call-for-call. Same browser calls, same ids,
same order — the split just moves the hardest arithmetic in the repo to a seam testable without a
fake browser.

- **realize-order.ts** — the pure realize planner: no `browser.*` calls, all index arithmetic.
  Houses `planFlatMoves`, `planBlockMoves`, and the `RealizeMove` / `StripTab` vocabulary that
  `runOrder` / `applyOrder` (`lib/tabs-service.ts`) replay one browser call at a time.
- **planFlatMoves** (`realize-order.ts`) — the fast-path translation behind `applyOrder`:
  survivor-filter plus the `planMoves` minimal-moves diff, mapped from survivor-strip indices to
  absolute window slots (a non-survivor still in the live strip would otherwise shift every move).
  What the ORDER phase degenerates to when nothing touches groups.
- **planBlockMoves** (`realize-order.ts`) — the three-pass block model (pinned region →
  within-group member order → top-level block walk), simulating each move internally so a later
  pass reasons about the layout the executor will have produced; emits `RealizeMove[]`. Full
  detail under **the block model** above.
- **RealizeMove** (`realize-order.ts`) — one emitted move: `{ kind: "tab"; id; index }` (a single
  `browser.tabs.move`) or `{ kind: "group"; groupId; index }` (a whole live group span via
  `browser.tabGroups.move`). The executor issues one browser call per move, strictly in order.
- **StripTab** (`realize-order.ts`) — the realize layer's per-tab view (`{ id, pinned, groupId }`),
  just enough live-strip state to drive `planBlockMoves`. Browser-boundary-only data, distinct
  from the pure layer's `TabLite`.

## Dedupe

- **planDedupe** (`lib/dedupe.ts`) — buckets tabs by `normalizeUrl` (protocol + lower-cased
  host + trailing-slash-trimmed path, hash/query stripped per `dedupeIgnoreHash` /
  `dedupeIgnoreQuery`); a bucket of size 1 is never a duplicate. **pinned-keeper rule**: within
  a duplicate bucket, the keeper is the lowest-index *pinned* tab if the bucket has any pinned
  tab, else the lowest-index tab overall — and every unpinned non-keeper is marked `close`. A
  pinned tab is **never** closed, even when another pinned tab in the same bucket is the
  keeper; dedupe's only promise about pinned tabs is that it never touches them, not that it
  picks a single "best" one.
- **runDedupe** (`lib/orchestration.ts`) — preview vs confirm: an unconfirmed call is pure (no
  snapshot, no mutation), so the popup can show a duplicate count before committing to the one
  near-destructive verb in this module.

## Undo

- **planUndo** (`lib/undo.ts`) — turns a captured `WindowSnapshot` back into a `TabPlan`
  against whatever the window looks like NOW. Survivors are partitioned by their **current**
  pinned flag (never the snapshot's) — respecting any pin change since the snapshot — each
  partition ordered by snapshot index, concatenated pinned-first; a tab whose pin state flipped
  just migrates to the other partition, still at its old relative position within it. Vanished
  ids are dropped; snapshot ids missing now are returned as `reopen` URL hints, re-created
  *before* `applyPlan` runs so they land as unknowns at the strip's end and the ORDER phase
  never has to reason about a not-yet-created tab.
- **undo-is-its-own-inverse** — `runUndo` (`lib/orchestration.ts`) saves the **pre-undo**
  snapshot afterward instead of clearing it — a deliberate deviation from the PRD's
  capture-consume-clear undo model (see `docs/adr/0002-tabplan-realize.md`). Hitting undo again
  re-applies the tidy/dedupe that was just undone (a de-facto redo) rather than becoming a
  no-op once the snapshot is gone.
- **session-store** (`lib/session-store.ts`) — one `WindowSnapshot` per window in
  `browser.storage.session` (in-memory for the browser session, no `sync` quota, readable from
  the popup across close/reopen — what lets undo survive the popup closing between "tidy" and
  "undo"). `saveUndo` / `loadUndo`; a malformed stored value fails a shape check,
  not a per-field salvage — a `WindowSnapshot` is only ever written by this same extension in
  this same browser session, so a bad shape means an interrupted write, not a value worth
  repairing.

## Where the seam extends (future / vocabulary-only)

These nouns are **not implemented** — they name the planned widening *beyond* Layer 1 (the
TabPlan / realize-path sections above), so future work shares language with the PRD set, indexed
at [`docs/prd/README.md`](docs/prd/README.md) (vision + Layer 1 + six build-ready surface specs:
`tabctl` CLI, MCP server, AI command bar, sessions/time-travel, rules engine, recall/bridges; with
a fact-check [Verification log](docs/prd/README.md#verification-log)).

- **Producer** — anything that emits a `TabPlan`: the popup buttons and hotkeys (today's
  producers), plus the planned **tabctl CLI**, **MCP tools**, and **AI command bar**. The LLM's
  only job is *natural language → TabPlan*; it never touches `chrome.*`, so AI is a producer,
  not a new code path.
- **plan preview** — the one seam-level safety primitive not yet generalized: showing a full
  plan diff before *any* producer's mutation runs. Today only dedupe previews, and only a
  count, via `runDedupe({ confirm: false })`. Undo itself is real (above) but per-action, not
  yet the universal AI-safety net that makes a hallucinated CLI/MCP/AI plan a rejected preview
  rather than a silent mutation.
- **native-messaging host** — the local relay binary that bridges the ephemeral MV3 service
  worker to `tabctl`/MCP over stdio; the MV3 worker cannot itself hold a long-lived server.

### Fact-checked gotchas (load-bearing, verified against `chrome.*` docs)

One correction from the PRD fact-check is now enforced code; the other is a constraint any
future host-driven (CLI/MCP) work must still respect:

- **Grouping silently unpins.** `chrome.tabs.group()` does **not refuse** pinned tabs — it
  *unpins* them, then groups them ([chromium #40639773](https://issues.chromium.org/issues/40639773)).
  So the planner/adapter must **exclude pinned ids from group calls** to keep pinned tabs pinned
  and pinned-first. **Enforced** in `runGroups` (`lib/tabs-service.ts`): every desired group's
  `tabIds` is filtered against a *fresh* live-strip query for pinned ids right before any
  `tabs.group()` call, re-checked at realize time in case a tab was pinned after the plan was
  built (not just against whatever the plan's producer saw).
- **Native messages can't wake a dormant worker.** Receiving a native message does *not* revive a
  terminated MV3 service worker; `connectNative()` only **keeps an already-running worker alive**.
  Any host-driven (`tabctl`/MCP) wake must come from a documented event source (`chrome.alarms`,
  ≥30s floor) or sustained traffic that holds the worker up.
