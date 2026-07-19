# Background mutation architecture

## Goal

One mutation truth. One local Prefs writer. Final browser state decides outcomes.

## Public seams

```ts
requestMutation(intent) -> action-specific result
requestPrefsPatch(patch) -> committed Prefs
```

The background owns:

```ts
executeMutation(intent) -> action-specific result
commitPrefsPatch(patch) -> committed Prefs
```

`MutationIntent` is a closed union for sort, tidy, dedupe, undo, and extract. Every intent
carries `windowId`. Dedupe reaches this seam only after Producer confirmation.

## Module map

- `lib/mutation.ts`: deep intent executor and transaction.
- `lib/mutation-realize.ts`: private UNGROUP → GROUPS → ORDER → CLOSE protocol.
- `lib/mutation-history.ts`: validated per-window RestorePoint journal.
- `lib/runtime.ts`: versioned client/listener envelope.
- `lib/window-queries.ts`: read-only popup data.
- `lib/storage.ts`: Prefs normalization and background-only patch FIFO.

The background entrypoint registers the runtime listener. It alone executes mutation intents
and Prefs patches. Popup and options cross the runtime boundary. Commands and context menus
dispatch the same typed intents inside the background.

## Mutation transaction

`executeMutation` serializes by window. It compiles sort, tidy, dedupe, and undo intents into
`TabPlan`; extract stays outside TabPlan but uses the same executor and queue.

TabPlan flow:

1. Refuse non-undo mutation when pending recovery exists.
2. Capture the target window.
3. Build the plan.
4. Store a pending journal entry with the pre-state RestorePoint before the first effect.
5. Call private `realizePlan`: UNGROUP → GROUPS → ORDER → CLOSE.
6. Capture final live state.
7. Derive the receipt from before versus final state.
8. Changed: promote pre-state to undo. No-op: clear pending, preserve old undo.
9. Failure: leave pending. Undo prefers pending over committed undo.

Undo reopens missing tabs into the explicit target window. New tab ids replace stale snapshot
ids before the restore plan is built. Each reopen is journaled so crash retry adopts the tab
instead of creating a duplicate.

Chrome cannot create and journal a tab atomically. Retry adopts the sole post-baseline tab with
the pending URL. Multiple matches fail with `RECOVERY_AMBIGUOUS`. A concurrent user tab with
the same URL is indistinguishable; this is an accepted recovery limit.

`RestorePoint` contains:

- `snapshot`: the target window state.
- `close`: live ids absent from that snapshot that restoration must close.

The close-set makes undo's two-state toggle exact after a prior undo introduced new ids.

## Receipt

The internal receipt reports:

- changed
- moved
- grouped
- ungrouped
- created and updated groups
- closed
- reopened
- vanished plan tabs

Counts come from captured and final live state, restricted to the plan's tabs and groups.
Browser call counts stay private.

## Group identity

The private reconciler matches by greatest positive member overlap. Lowest group id breaks
ties. Equal title with zero overlap never matches. A new group is safer than changing a manual
group.

## Prefs

Options sends a patch to the background. One global FIFO runs a fresh
read → normalize → merge → write for each patch. Same-browser disjoint patches survive.
Cross-device Sync remains last-write-wins.

## Runtime boundary

One versioned request envelope carries mutation intents and Prefs patches. The background
validates unknown messages and returns a stable success/error envelope. The Chrome listener
uses `sendResponse` and returns `true` for asynchronous replies.

Only the background calls `executeMutation` and `commitPrefsPatch`. Read-only window and Prefs
queries do not cross this command boundary.

## Tests

Tests target `executeMutation`, runtime request handling, and `commitPrefsPatch`.

Required behavior:

- Sort records undo.
- Metadata-only tidy records undo.
- No-op preserves prior undo.
- Partial failure and restart retain recovery.
- Same-window actions serialize; different windows do not block each other.
- Receipt follows final live state.
- Equal-title, zero-overlap groups stay untouched.
- Undo reopens into the target window and remaps ids.
- Concurrent disjoint Prefs patches both survive.
- Invalid runtime messages and patches fail safely.

## Non-goals

- General TabPlan submission by external Producers.
- Layer-1.5 preview tokens or expiry.
- Multi-window TabPlan.
- Cross-device Prefs conflict resolution.
