# ADR-0003: Split Phase on the realize ORDER engine — pure planner, replaying executor

- **Status:** Accepted
- **Date:** 2026-07-17
- **Origin:** Architecture round on `claude/codebase-architecture-refactor` — deepening pass
  over `lib/tabs-service.ts` after ADR-0002 landed the four-phase realize.

## Context

ADR-0002's ORDER phase (`runOrder`) carried ~150 lines of pure index arithmetic — the
pinned-region diff, within-group member ordering, and the top-level block walk — interleaved
with `await browser.tabs.move` / `tabGroups.move` calls inside the effectful `tabs-service.ts`.
Every decision after the initial strip query derived from the in-memory `sim` mirror, never
from a re-read of the browser, so the interleaving bought nothing. The math was only testable
through the fake-browser mock (`realize.fuzz.test.ts` — a file named for a module that didn't
exist), and `tabs-service.ts` had grown to 477 lines spanning query adapters, snapshotting,
and the realize engine.

Per Fowler, a Gateway "should be as minimal as possible"; logic that builds on the
translation belongs in the Gateway's clients. The trapped planner was exactly that logic.

## Decision

Apply Split Phase: `lib/realize-order.ts` is a new pure module that computes a move script;
the executor in `tabs-service.ts` replays it call-for-call.

- `planFlatMoves(liveOrder, orderedIds)` — the survivor-filter + minimal-moves translation
  behind `applyOrder`'s fast path.
- `planBlockMoves(strip, order): RealizeMove[]` — the three-stage block model
  (pinned region → within-group order → top-level block walk), simulating internally.
  `RealizeMove = { kind: "tab"; id; index } | { kind: "group"; groupId; index }`.
- `StripTab` moves with the planner; `simMove` and `OrderBlock` become private
  implementation details. The executor issues one browser call per emitted move, in order.

The refactor is call-for-call behavior-preserving: same browser calls, same ids, same
indices, same order. `runOrder`'s fast path still delegates to `applyOrder`, including
`applyOrder`'s own fresh query — the double query is kept deliberately, since collapsing it
would narrow the vanish-window semantics ADR-0002 documented.

TabPlan itself stays a passive change-set; phase ordering (UNGROUP → GROUPS → ORDER → CLOSE)
stays owned by the executor, not the plan. Splitting the phases into the data would move
"when" into a structure that should only say "what".

## Consequences

- The hardest math in the repo is now tested at a pure seam: seeded fuzz asserts the
  minimal-move bound (`moves = n − LIS`), group contiguity after replay, the pinned front
  block, and idempotence (planning an achieved state emits nothing) — no fake-browser in
  the loop. The old mock-path tests remain untouched as integration cover.
- Coupling moved from a behavioral interface to the `RealizeMove` schema. Accepted: the
  vocabulary is two variants, in-repo, and coverage-gated; growing it is a visible schema
  change rather than an invisible behavioral one.
- Open question (deliberately not taken here): every realize phase silently drops vanished
  ids — optimistic-lock re-validation with the conflict signal deleted. If conflict
  visibility is ever wanted, `applyPlan`'s result is the natural place to count drops.
