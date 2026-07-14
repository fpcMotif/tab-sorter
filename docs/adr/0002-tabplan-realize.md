# ADR-0002: One realize path — TabPlan and the group-aware block realize

- **Status:** Accepted
- **Date:** 2026-07-10
- **Origin:** Layer 1 build (`docs/prd/2026-06-21-layer1-tidy-groups-undo.md`) — tidy, tab
  groups, dedupe, and undo landed on `lib/tidy.ts`, `lib/group-ops.ts`, `lib/dedupe.ts`,
  `lib/undo.ts`, `lib/session-store.ts`, and `applyPlan` in `lib/tabs-service.ts`.

## Context

The MVP's seam was a bare `number[]` window order, realized by `applyOrder`'s minimal-moves
diff. Layer 1 needed to add native tab groups, a non-destructive "tidy" verb, a confirmed
dedupe, and undo — four new producers that all still need to reorder tabs, and three of them
(tidy, undo, and tidy's own group membership) also need to create/reconcile/dissolve groups.

The PRD (§3) proposed widening the seam to a `TabPlan` IR (`{ windowId, order, groups, close }`)
and a realize layer that runs `applyOrder` then a group diff then close, in that order. Building
it surfaced four decisions the PRD left open or got not-quite-right.

## Decisions

### 1. Groups realize *before* order, not after

The PRD's proposed realize order was order → groups → close (§4, §7). Building `runOrder`
against a window that already has live groups showed this is backwards.

`chrome.tabs.group()` does not merely label tabs — it **moves** them, unilaterally, to make
every member of a group contiguous. This is the same class of behavior as the pinned-front
clamp (`CONTEXT.md`): Chrome silently overrides the position you just set. If ORDER ran first,
the subsequent GROUPS phase's `tabs.group()` calls would immediately undo part of that careful
ordering by yanking members back into contiguity wherever Chrome chooses, not wherever ORDER
placed them.

Running GROUPS first sidesteps this entirely: by the time ORDER's block model queries the live
strip, every group Chrome knows about is already exactly one relocatable span, and ORDER's block
model (`runOrder` in `lib/tabs-service.ts`) can treat a whole group as a single `tabGroups.move`
block alongside ungrouped singletons. `applyPlan` realizes, in order: **UNGROUP → GROUPS → ORDER
→ CLOSE**.

### 2. `TabPlan.ungroup` is an explicit, declarative field — not inferred from absence

The PRD's `TabPlan` had only `order`, `groups`, and `close` — no way to say "this tab must end
ungrouped." Absence from `groups` is ambiguous: it could mean "no opinion, leave it wherever it
is" (true for most tabs) or "this tab must be pulled out of its current group" (true for a
leftover singleton after `regroupExisting` dissolves an old group). `groups` can only make
*positive* membership claims; it has no way to make a negative one for a tab no new group wants.

`TabPlan` therefore carries `ungroup: number[]` as its own field, realized as its own phase
(`runUngroup`) before GROUPS runs. This keeps `planGroupOps` (the group reconciler) simple: it
never emits an "ungroup" op itself, because that channel already belongs to someone else — see
CONTEXT.md's **never-emits-ungroup invariant**. A tab leaving its matched live group for a
*different* desired group needs no `ungroup` entry at all; `tabs.group()`'s implicit membership
transfer handles that case, so `ungroup` only ever needs to name tabs no `GroupSpec` claims.

### 3. Undo saves the pre-undo snapshot, not a cleared one (deviation from PRD §2.6)

The PRD's undo state machine (§5) was capture → mutate → consume-on-undo → clear: a single
snapshot per window, gone once restored. `runUndo` (`lib/orchestration.ts`) instead calls
`snapshotWindow()` again immediately before restoring, and saves *that* — the state the window
was in right before undo ran — rather than clearing the slot.

This makes undo its own inverse. Hitting undo a second time doesn't no-op (the PRD's model);
it re-applies whatever tidy/dedupe had just been undone, a de-facto redo. Given Layer 1's
single-step undo depth (PRD decision #6), this was judged more forgiving than a hard clear: a
stray extra press restores rather than silently doing nothing, and the mental model
("undo toggles between the last two states of this window") is simpler to hold than
"undo consumes a one-shot ticket."

### 4. `runSort` is the degenerate `TabPlan`

Per the PRD's open question #4, `runSort` was refactored to build a full `TabPlan` —
`{ order: desiredOrder, groups: [], ungroup: [], close: [] }` — and go through `applyPlan`
rather than keeping a separate `applyOrder`-only path alongside it. `applyOrder` itself
survives, but demoted to an internal fast path: `applyPlan`'s ORDER phase calls it directly
whenever nothing in the plan or the live window touches groups, instead of running the full
block model to reach the same result. One realize path, one degenerate producer, one fast path
inside it — not two parallel realize paths to keep in sync.

### 5. `windowId` is omitted from `TabPlan` v1 — the adapter is a current-window adapter

The PRD's draft `TabPlan` (§3) carried a `windowId: number` field. The shipped `TabPlan`
(`lib/types.ts`) has none. Layer 1 is scoped to the current window only (PRD decision #8), and
every producer (`planTidy`, `planDedupe`, `planUndo`, `planWindowOrder`) already only ever sees
tabs from one window's snapshot — there is no cross-window plan to disambiguate. `applyPlan`
(`lib/tabs-service.ts`) resolves the window itself via `getCurrentWindowId()` rather than taking
one as a parameter.

This keeps `TabPlan` a plain description of "what this window's tabs/groups should look like,"
with no window-identity bookkeeping for producers to get wrong. Widening to multi-window is
future work (CONTEXT.md's "Where the seam extends"); it will need `windowId` back, but as an
addition to `TabPlan` v1, not a field every current producer has to thread through today for a
capability nothing yet uses.

## Consequences

- One realize path (`applyPlan`) for sort, tidy, dedupe, and undo — no producer talks to
  `browser.tabs`/`browser.tabGroups` directly.
- The GROUPS-before-ORDER ordering is load-bearing and must not be reordered; `runOrder`'s block
  model depends on every live group already being contiguous when it queries.
- `ungroup` must stay a producer-owned, explicit field. A future producer that dissolves or
  reassigns groups must compute its own `ungroup` list; it cannot rely on `planGroupOps` to
  infer one.
- Undo-as-toggle is a product behavior, not just an implementation detail: a user who presses
  undo twice gets their mutation back, not two ticks of history. If Layer 2 wants multi-step
  undo, this toggle behavior is what has to change first.
- `TabPlan` gains `windowId` (or an equivalent) only when a producer actually needs to describe
  more than one window — don't add it speculatively.
