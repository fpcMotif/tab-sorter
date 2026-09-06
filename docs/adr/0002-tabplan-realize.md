# ADR-0002: One realize path — TabPlan and the group-aware block realize

- **Status:** Accepted; amended by ADR-0003 and ADR-0004
- **Date:** 2026-07-10
- **Historical origin:** The 2026-07-10 Layer 1 build added tidy, groups, dedupe, and undo.
  See `docs/prd/2026-06-21-layer1-tidy-groups-undo.md`. It used `lib/tidy.ts`, the former
  `lib/group-ops.ts`, `lib/dedupe.ts`, `lib/undo.ts`, the former `lib/session-store.ts`, and
  the former public `applyPlan`. ADR-0003 replaced that split with the current transaction.

## Context

The MVP's seam was a bare `number[]` window order, realized by `applyOrder`'s minimal-moves
diff. Layer 1 added native tab groups, a non-destructive "tidy" verb, a confirmed dedupe, and
undo — four new producers that all reorder tabs, three of which (tidy, undo, and tidy's own
group membership) also create/reconcile/dissolve groups.

The PRD (§3) proposed widening the seam to a `TabPlan` IR (`{ windowId, order, groups, close }`)
and a realize layer running `applyOrder`, then a group diff, then close, in that order. Building
it surfaced five decisions the PRD left open or got not-quite-right.

## Decisions

### 1. Groups realize *before* order, not after

The PRD proposed order → groups → close (§4, §7). Building `runOrder` against a window that
already has live groups showed this is backwards.

`chrome.tabs.group()` does not merely label tabs — it **moves** them, unilaterally, to make
every member contiguous. Same class of behavior as the pinned-front clamp (`CONTEXT.md`): Chrome
silently overrides the position you just set. ORDER first would let the GROUPS phase's
`tabs.group()` calls yank members back into contiguity wherever Chrome chooses, undoing part of
the ordering ORDER just set.

GROUPS first sidesteps this. By the time ORDER queries the live strip, every group is one
relocatable span, and `runOrder` in private `lib/mutation-realize.ts` treats it as one
`tabGroups.move` block beside ungrouped singletons. `realizePlan` runs **UNGROUP → GROUPS →
ORDER → CLOSE**.

### 2. `TabPlan.ungroup` is an explicit, declarative field — not inferred from absence

The PRD's `TabPlan` had only `order`, `groups`, and `close` — no way to say "this tab must end
ungrouped." Absence from `groups` is ambiguous: "no opinion, leave it wherever it is" (true for
most tabs) or "this tab must be pulled out of its current group" (true for a leftover singleton
after `regroupExisting` dissolves an old group). `groups` makes only *positive* membership
claims; it cannot make a negative one for a tab no new group wants.

So `TabPlan` carries `ungroup: number[]` as its own field, realized before GROUPS. Private group
reconciliation never infers negative membership from absence. A tab moving to another desired
group needs no `ungroup` entry; `tabs.group()` transfers membership.

### 3. Undo saves the pre-undo snapshot, not a cleared one (deviation from PRD §2.6)

The PRD's undo state machine (§5) was capture → mutate → consume-on-undo → clear. The current
transaction captures the pre-undo state and promotes it after a changed restore.

This makes undo its own inverse. `lib/mutation-history.ts` stores a `RestorePoint`: snapshot
plus ids that restoration must close. The close set makes the toggle exact after an earlier undo
reopened missing tabs under new ids. Journaled reopen progress makes crash retry idempotent.

### 4. Sort is the degenerate `TabPlan`

Per the PRD's open question #4, sort builds a full `TabPlan`:
`{ order: desiredOrder, groups: [], ungroup: [], close: [] }`. `executeMutation` sends it
through private `realizePlan`. Private `applyOrder` remains only as the groupless ORDER fast
path. One effect protocol.

### 5. `windowId` belongs to the mutation intent, not `TabPlan`

The PRD's draft `TabPlan` (§3) carried a `windowId: number` field. The shipped `TabPlan`
(`lib/types.ts`) has none. A plan describes one captured window. Every `MutationIntent` carries
an explicit `windowId`; `executeMutation` queues on that id, captures that window, and passes the
same id to `realizePlan`. No ambient current-window lookup after enqueue. Multi-window TabPlan
stays outside this design.

## Consequences

- One private realize path (`realizePlan`) for sort, tidy, dedupe, and undo. Producers send
  intents; only the background transaction mutates browser state.
- GROUPS-before-ORDER is load-bearing and must not be reordered; `runOrder`'s block model needs
  every live group already contiguous when it queries.
- `ungroup` stays explicit. A planner that dissolves a group must compute it.
- Undo-as-toggle is a product behavior, not just an implementation detail: press undo twice and
  you get your mutation back, not two ticks of history. If Layer 2 wants multi-step undo, this
  toggle behavior is what has to change first.
- `TabPlan` gains window identity only if one plan must span windows. The current intent always
  supplies one target.
