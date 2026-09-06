# CONTEXT — Tab Sorter domain glossary

The shared language for the extension. Architecture vocabulary — module, interface,
seam, depth, adapter, leverage, locality — come from the `/codebase-design` skill.
This file names the **domain**.

## Core nouns

- **TabLite** (`@tab-sorter/core/types`) — the trimmed tab the pure layer reasons about:
  `{ id, url, title, index, pinned }` plus optional `groupId` (live tab-group id;
  `TAB_GROUP_NONE` when ungrouped; optional so plain-array test fixtures stay terse).
  It is the only shape `domain`/`sort`/`match`/`plan`/`tidy`/`dedupe`/`undo` see. Raw
  browser tab shapes stay inside `tabs-service` and the mutation adapter.
- **SortMode** — `"title"` (A→Z by page title) or `"domain"` (grouped by domain, then title).
- **DomainGroup** — `{ domain, count, tabIds }`. Feeds the popup's clickable domain list. Built by
  `groupByDomain` in `@tab-sorter/core/domain-groups` (domain-bucketing of tabs), sibling to `@tab-sorter/core/match`'s
  pattern surface. `matchByDomain` (same module) resolves one bucket's ids for extraction.
- **Prefs** — `{ defaultSort, ignorePinned, regexPresets }` plus the Layer 1 tidy/dedupe knobs
  (`collapseAfterTidy`, `minGroupSize`, `groupOrder`, `regroupExisting`, `dedupeIgnoreHash`,
  `dedupeIgnoreQuery`), persisted in `chrome.storage.sync`. Any context may read. The background's
  `commitPrefsPatch` FIFO serializes same-browser writes.

## Ordering & the pinned boundary

- **Window order** — the desired absolute order of *every* tab id in one target window,
  a permutation of `tabs.map(t => t.id)`. This bare `number[]` is the seam between pure
  planning and the side-effect adapter — today the `order` field of a `TabPlan` (below),
  anchored at index 0.
- **planWindowOrder** (`@tab-sorter/core/plan`) — the one **pinned-aware** ordering rule, built on
  the pinned-agnostic primitives in `@tab-sorter/core/sort`. Owns the pinned-front invariant. Its
  interface is the test surface (`packages/core/tests/plan.test.ts`, plain arrays, no browser mock).
- **pinned-front invariant** — Chrome keeps pinned tabs as a contiguous block at the window
  front. It **silently clamps** any move that crosses that boundary: no throw, no unpin, just
  a wrong permutation. Verified HIGH-confidence against the `chrome.tabs` contract.
- **never-interleave construction** — `[...pinnedOrder, ...sortFn(unpinned)]`: sort each
  region separately, concatenate pinned-first. A comparator can never float a pinned id into
  the unpinned region, so the clamp bug is structurally unrepresentable. **Must stay split
  forever**: one comparator over all tabs reintroduces the bug. `packages/core/tests/plan.test.ts` guards the
  regression.
- **ignorePinned** — when set, the pinned block keeps its current order (frozen); otherwise
  pinned tabs sort among themselves. Either way, pinned ids precede unpinned ids.

## Matching patterns

- **the pattern surface** (`@tab-sorter/core/match`) — the one public home for judging and running a
  user-supplied regex. Three **non-throwing** entry points, so validity is one rule everywhere:
  - **validatePattern** (`source`, `flags`) → **PatternVerdict** (`{ ok: true; regex }` |
    `{ ok: false; reason }`). Enforces the **match safety cap**, then compiles. The tabs-less
    verdict the `options` preset form reads before persisting.
  - **matchPattern** (`tabs`, `source`, `flags`) → **MatchResult** (`{ ok: true; ids }` |
    `{ ok: false; reason }`). Validates, then tests each tab's `title\nurl`. Shared by the popup
    preview and the extract branch of `executeMutation`. An invalid pattern matches no tabs.
  - **reasonToString** (`reason`) → string. The single home for the user-facing copy, so the
    popup and options can't drift.
- **PatternErrorReason** — `"pattern" | "flags" | "tooLong"`, the discriminant every caller
  reads. **compilePattern** is now an **internal** primitive behind `validatePattern`. It owns
  the **g/y-strip rule** (a reused `g`/`y` matcher advances `lastIndex` and would skip tabs) and
  the pattern-vs-flags probe. A *behaviour* test guards the g/y-strip rule through `matchPattern`,
  not through the internal primitive.
- **match safety cap** (`MATCH_SAFETY_CAP`, 1000) — the one length bound every matching path
  inherits. It caps regex backtracking (ReDoS) cost and closes the formerly-unbounded
  `runExtract` regex path. **Not** the `options` preset's stricter storage cap (500,
  a `chrome.storage.sync` quota rule); the two are deliberately separate — see
  `docs/adr/0001-two-pattern-caps.md`. Cap, compilation, and preview all route through the
  pattern surface, so one rule judges validity everywhere.

## Realizing an order

- **applyOrder (private realize fast path)** (`lib/mutation-realize.ts`) — takes a window order,
  re-queries the explicit target window, drops vanished ids, and issues only the needed moves
  via `planMoves` and single-id `browser.tabs.move` calls. Not a public mutation seam.
  `realizePlan` uses it when neither the plan nor the live window touches groups.
- **planMoves / minimal-moves diff** (`@tab-sorter/core/tab-moves`) — pure internal helper of the realize
  layer (not on `applyOrder`'s interface). Keeps the longest already-in-order run (the LIS by
  target rank) fixed and relocates only the rest, so an almost-sorted window flickers a handful
  of tabs, not all N. Proven correct and minimal (`moves == n − LIS`) over every permutation up
  to n=7 in `tab-moves.test.ts`, and up to n=14 by fuzz in `invariants.test.ts`.
- **changed-count** (`moved`) — the number of positions where the desired window order differs
  from the current id list: the true count of tabs whose index changes. What the popup toast
  reports — *not* the number of tabs considered, *not* the number of `move` calls issued.

## The TabPlan IR

- **TabPlan** (`@tab-sorter/core/types`) — the widened seam: `{ order, groups, ungroup, close }`.
  **order** is a permutation of the live unclosed tab ids, pinned-first (Window order,
  generalized); **empty `order` means "leave positions alone"** — dedupe only sets `close`,
  never touches position. **groups** is the desired `GroupSpec[]` (below). **ungroup** lists
  ids that must end ungrouped: the one channel that pulls a tab *out* of a group when no new
  group claims it. Moves *between* groups need no entry — a tab joins at most one group, and
  `tabs.group()` drops it from any old one. **close** lists ids to remove. The `sort` intent is
  the degenerate case — `{ order: desiredOrder, groups: [], ungroup: [], close: [] }` — so sort,
  tidy, dedupe, and undo all compile to this IR inside `executeMutation`, and the private
  realizer consumes it. See `docs/adr/0002-tabplan-realize.md`.
- **GroupSpec** (`@tab-sorter/core/types`) — `{ key, title, color, collapsed, tabIds }`. `tabIds` is a
  contiguous slice of `order` with no pinned ids (grouping silently unpins — the fact-checked
  gotcha below). `key` is the plan-local identity a producer picks: `planTidy` uses the domain,
  `planUndo` uses `g${groupId}`. The group reconciler (below) never needs a live `groupId` from
  a producer, only this stable key.
- **planTidy** (`@tab-sorter/core/tidy`) — the one producer that builds both `order` and `groups` from a
  bare tab list. Buckets ungrouped, unpinned tabs by `getDomain`. Buckets below `minGroupSize`
  stay ungrouped leftovers. Each surviving bucket sorts by title (`sortByTitle`); the buckets
  themselves order alpha or size-desc (`GroupOrder`). With `regroupExisting` off (default), an
  already-grouped tab's group stays an **untouched atomic block**, placed first in the unpinned
  region, and `ungroup` stays empty — tidy claims only *ungrouped* unpinned tabs. With it on,
  every unpinned tab is reclaimed and rebucketed by domain, dissolving old groups; a
  previously-grouped tab that lands as a leftover singleton is reported in `ungroup` (one
  absorbed into a *new* group needs no entry). **assignColor** (`@tab-sorter/core/domain` — the domain
  vocabulary: name + color) is a deterministic djb2-hash → 9-color palette lookup, so a domain
  always gets the same swatch. Collisions across >9 domains are expected and accepted; the title
  disambiguates.

## Window mutation

- **Mutation intent** — one confirmed request to change one explicit browser window: sort,
  tidy, dedupe, undo, or extract. Foreground Producers use `requestMutation`; background
  commands and context menus dispatch the same union locally. Only the background calls
  `executeMutation`.
- **mutation transaction** (`lib/mutation.ts`) — validates intents and queues work per window.
  It captures, plans, journals, realizes, observes, and promotes undo. Sort, tidy, dedupe, and
  undo use `TabPlan`. Extract shares the executor and queue. It stays outside the transaction.
- **Mutation receipt** — the observed change between the captured and final live window,
  restricted to the intent's tabs and groups. It reports browser state, never attempted calls.
- **RestorePoint** (`lib/mutation-history.ts`) — a `WindowSnapshot` plus a `close` set. The close
  set names live ids absent from the target snapshot that a prior undo introduced, so another
  undo restores the earlier state exactly after reopened tabs got new ids.
- **Pending recovery** — the durable RestorePoint journal kept while a TabPlan mutation is in
  flight. A failure or worker restart leaves it recoverable and blocks non-undo mutation.
  Reopen progress is journaled so retry adopts a created tab instead of opening a duplicate.

## The group reconciler

- **private group reconciliation** (`runGroups` in `lib/mutation-realize.ts`) — realizes desired
  `GroupSpec[]` from a fresh live strip. Each desired group claims at most one live group: the
  unclaimed group with greatest **positive member overlap**; lowest `groupId` breaks ties.
  Equal title with zero overlap never proves identity. A match receives missing members and
  only changed metadata. An unmatched spec creates a new group. These operations are browser
  mechanics, not domain output.
- **explicit-ungroup invariant** — reconciliation never infers "must end ungrouped" from
  absence. `TabPlan.ungroup` is the only negative membership channel. Moving a tab to another
  desired group needs no ungroup entry because `tabs.group()` transfers membership.

## Realizing a plan

- **realizePlan** (`lib/mutation-realize.ts`) — the sole, private TabPlan effect protocol. It
  realizes against the explicit `windowId` in four fixed phases: **UNGROUP → GROUPS → ORDER →
  CLOSE**. Each phase filters against fresh live state, so vanished ids do not corrupt later
  index math. Only `lib/mutation.ts` calls it; callers learn outcomes from the final-state diff.
- **groups-before-order** — the load-bearing ordering constraint (see
  `docs/adr/0002-tabplan-realize.md`). `tabs.group()` auto-moves its members contiguous: Chrome
  repositions tabs the moment you group them, the same silent override as the pinned-front clamp
  above. GROUPS *after* ORDER would let that auto-move undo the position ORDER just set. GROUPS
  first means every group is one relocatable span by the time ORDER's block model queries the
  strip.
- **the block model** (`runOrder`, `lib/mutation-realize.ts`) — realizes `plan.order` in three
  passes: (a) the pinned region via `planMoves` (its region-relative index is already absolute —
  pinned tabs are always the window's contiguous front block); (b) fix each live group's
  *internal* member order via `planMoves` scoped to the group's span, before the group moves as
  a whole — `tabGroups.move` carries members in their current relative order, so getting that
  order right first means the group needs only one relocating move; (c) walk the desired unpinned
  sequence left to right, relocating each top-level block into place — a group (one
  `tabGroups.move`, spanning its full LIVE membership even if `plan.order` omits some member) or
  an ungrouped singleton (`tabs.move`). **Fast path**: when nothing in the plan or live window
  touches groups, private `applyOrder` uses `planMoves`.

## Dedupe

- **planDedupe** (`@tab-sorter/core/dedupe`) — buckets tabs by `normalizeUrl` (protocol + lower-cased
  host + trailing-slash-trimmed path; hash/query stripped per `dedupeIgnoreHash` /
  `dedupeIgnoreQuery`). A bucket of size 1 is never a duplicate. **pinned-keeper rule**: within
  a duplicate bucket, the keeper is the lowest-index *pinned* tab if any pinned tab exists, else
  the lowest-index tab overall; every unpinned non-keeper is marked `close`. A pinned tab is
  **never** closed, even when another pinned tab in the same bucket is the keeper. Dedupe
  promises only that it never touches pinned tabs, not that it picks a single "best" one.
- **dedupe confirmation** — `window-queries.ts` derives the popup count with pure `planDedupe`.
  The popup owns confirmation state. Only a confirmed `dedupe` intent reaches the background
  executor and transaction.

## Undo

- **planUndo** (`@tab-sorter/core/undo`) — turns a captured `WindowSnapshot` back into a `TabPlan`
  against whatever the window looks like NOW. Survivors partition by their **current** pinned
  flag, never the snapshot's, respecting any pin change since the snapshot. Each partition orders
  by snapshot index, concatenated pinned-first. A tab whose pin state flipped migrates to the
  other partition, still at its old relative position. The transaction reopens missing URLs into
  the explicit target window, journals each new id, remaps stale snapshot ids, then builds the
  restore plan.
- **undo-is-its-own-inverse** — a changed undo promotes its own pre-state RestorePoint. The next
  undo restores that state. RestorePoint `close` ids make the toggle exact when the first undo
  reopened tabs under new ids.
- **mutation history** (`lib/mutation-history.ts`) — one validated `MutationHistory` per window
  in `browser.storage.session`: committed `undo` plus optional `pending`. It migrates the old
  `undo:${windowId}` snapshot once. Malformed journal state is dropped. A no-op clears pending
  and preserves prior undo; changed success promotes pre-state; failure leaves pending.

## Where the seam extends (future / vocabulary-only)

These nouns are **not implemented**. They name the planned widening *beyond* Layer 1 (the
TabPlan / realize-path sections above), so future work shares language with the PRD set, indexed
at [`docs/prd/README.md`](docs/prd/README.md) (vision + Layer 1 + six build-ready surface specs:
`tabctl` CLI, MCP server, AI command bar, sessions/time-travel, rules engine, recall/bridges; plus
a fact-check [Verification log](docs/prd/README.md#verification-log)).

- **Producer** — anything that emits a confirmed `MutationIntent`: popup buttons, commands, and
  context menus today; planned **tabctl CLI**, **MCP tools**, and **AI command bar** later.
  Producers never touch `chrome.*`. Direct general TabPlan submission is not a current seam.
- **plan preview** — the one seam-level safety primitive not yet generalized: a full plan diff
  shown before *any* producer's mutation runs. Today only dedupe previews, and only a count,
  through pure `planDedupe`. Undo is real (above) but per-action — not yet the universal
  AI-safety net that turns a hallucinated CLI/MCP/AI plan into a rejected preview rather than a
  silent mutation.
- **native-messaging host** — the local relay binary that bridges the ephemeral MV3 service
  worker to `tabctl`/MCP over stdio. The MV3 worker cannot itself hold a long-lived server.

### Fact-checked gotchas (load-bearing, verified against `chrome.*` docs)

One PRD fact-check correction is now enforced in code. The other is a constraint any future
host-driven (CLI/MCP) work must respect:

- **Grouping silently unpins.** `chrome.tabs.group()` does **not refuse** pinned tabs — it
  *unpins* them, then groups them ([chromium #40639773](https://issues.chromium.org/issues/40639773)).
  So the planner/adapter must **exclude pinned ids from group calls** to keep pinned tabs pinned
  and pinned-first. **Enforced** in `runGroups` (`lib/mutation-realize.ts`): every desired group's
  `tabIds` is filtered against a *fresh* live-strip query for pinned ids right before any
  `tabs.group()` call. The re-check at realize time catches a tab pinned after the plan was built,
  not just what the plan's producer saw.
- **Native messages can't wake a dormant worker.** Receiving a native message does *not* revive a
  terminated MV3 service worker; `connectNative()` only **keeps an already-running worker alive**.
  Any host-driven (`tabctl`/MCP) wake must come from a documented event source (`chrome.alarms`,
  ≥30s floor) or sustained traffic that holds the worker up.
