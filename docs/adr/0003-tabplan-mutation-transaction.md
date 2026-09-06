# ADR-0003: One TabPlan mutation transaction

- **Status:** Accepted
- **Date:** 2026-07-15

`lib/mutation.ts` owns the full TabPlan transaction. It validates, captures, plans, journals,
realizes, observes, reports, and promotes undo. Snapshot policy cannot sit in a caller. That
would create two mutation truths.

Private `lib/mutation-realize.ts` owns browser effects and group mechanics. It returns no call
counts. `mutation.ts` compares captured and final state. The comparison covers the plan's tabs
and groups.

The background is the sole mutation executor. Producers send typed intents with an explicit
`windowId`. One FIFO serializes each window. Different windows may proceed together.

The transaction journals recovery before its first effect. `lib/mutation-history.ts` stores a
snapshot and rollback close-set in each `RestorePoint`. Undo journals each reopen. After a
restart, retry adopts the created tab and remaps its id.

Chrome cannot create and journal a tab atomically. Retry therefore adopts the sole
post-baseline tab with the pending URL. Multiple matches fail with `RECOVERY_AMBIGUOUS`. A
concurrent user tab with the same URL is indistinguishable. This is an accepted recovery limit.

A no-op clears pending state and keeps prior undo. A changed success promotes the pre-state.
Failure or restart leaves pending recovery. Non-undo work stays blocked until undo restores it.
Sort and metadata-only tidy also record undo.

A changed undo promotes its own pre-state. Undo therefore toggles between two exact states,
including cases where restore reopened tabs under new ids.

Extract uses the same executor and per-window FIFO. It stays outside TabPlan and undo until
TabPlan supports multiple windows. Layer-1.5 preview tokens, expiry, and window-version checks
remain future work. Dedupe confirmation stays with its Producer.
