# ADR-0006: Extract by pattern across all windows

- **Status:** Proposed
- **Date:** 2026-07-19

Extract gains an all-windows scope: a domain or regex sweeps every normal window and
consolidates the matches into one new window. Today's extract reads only the current window;
that behavior is unchanged and stays the default.

## Scope

An optional `scope?: "window" | "all"` is added to the extract `MutationIntent`; absent means
`"window"`. `windowId` stays required and, for `scope: "all"`, carries the **origin** window
(reporting and consolidation seed only — never enqueue routing). Optional-not-required is
deliberate: the strict `isMutationIntent` allow-list and existing tests assert scope-less
extracts are valid, so a required field would flip them to `INVALID_REQUEST` at runtime with no
compiler signal. `MutationResultByType.extract` is unchanged for the window path.

The executor queries `browser.tabs.query({ windowType: "normal" })` — excluding app/PWA/devtools
windows, whose tabs reject `tabs.move` — builds a local `tabId → windowId` map for provenance
(`TabLite` drops `windowId`, so it is not widened), filters pinned per `ignorePinned`, matches
through the existing `matchedIds` seam, and consolidates via `moveTabsToNewWindow`.

## Concurrency

Mutations serialize per window through `windowTails`. An all-windows extract spans every window,
so a concurrent per-window sort/tidy could reorder or close a matched tab mid-move. A
reader/writer barrier is layered onto `windowTails`: per-window mutations are readers (unchanged
cross-window concurrency, now also gated behind any pending writer); an all-windows extract is an
exclusive writer that drains every in-flight reader and blocks new ones until it completes. The
writer's `wideBarrier` reset is identity-guarded, mirroring the existing `windowTails` cleanup, so
a finished writer cannot clobber a later in-flight one. `Promise.allSettled` joins preserve the
current run-regardless-of-outcome tail semantics.

## Recovery

Extract records no undo journal, so all-windows extract is non-undoable, consistent with
[ADR-0003](0003-tabplan-mutation-transaction.md) (extract stays outside TabPlan until a
multi-window TabPlan exists). Because the writer holds the exclusive lock, any `pending` it
observes is a pre-existing interrupted transaction, not a live one.

If any window it would touch has `pending !== undefined`, the whole operation **blocks** — it
moves nothing and throws `RECOVERY_REQUIRED`. Skip-and-continue was rejected: the popup's recovery
banner and Recover button are wired to the current window only, but blocking is surfaced with a
label so it is not a dead-end. The thrown message **names the blocking window by its active tab's
title** (falling back to domain, then a generic phrase; ">1 pending" names the first plus a
count), and the popup renders that message for `RECOVERY_REQUIRED` in place of the generic error.
The gate is scoped to touched windows only — a pending window with zero matches never blocks.

Committed-undo staleness (a later per-window Undo reopening moved-out tabs by URL) is unchanged
from single-window extract and explicitly out of scope; clearing `history.undo` on extract, if
ever wanted, is a separate change applied to both paths.

## UI

The popup **augments** rather than replaces: today's domain rows and pattern panel are untouched;
a "This window / All windows" toggle re-scopes both, shown only when more than one window is open.
`windowCount` is added to `PopupData` eagerly (cheap `windows.getAll()`); cross-window counts load
lazily on first flip, so popup-open cost is unchanged. Default scope is the current window, auto-
switching to all windows when the current window has ≤1 tab and more than one window is open. The
new window opens unfocused so the popup survives to show the summary and a "Show new window"
button. A sibling context-menu item, "Extract this site from all windows," ships alongside.

Replace (every extract always all-windows) was rejected: it deletes the current-window capability,
makes the common case pay the barrier and the recovery block, and silently changes the context
menu and keyboard shortcut.
