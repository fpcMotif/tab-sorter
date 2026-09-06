# ADR-0005: One local writer for Prefs

- **Status:** Accepted
- **Date:** 2026-07-16

All same-browser Prefs patches cross the runtime boundary through `requestPrefsPatch`.
The background alone calls `commitPrefsPatch` in `lib/storage.ts`. One FIFO serializes a fresh
read → validated merge → write to `chrome.storage.sync` for each patch. Reads and change
subscriptions remain available to popup and options.

Chrome Sync has no transaction or compare-and-swap operation. Direct writes from multiple
extension contexts can lose distinct edits. Cross-device Sync remains last-write-wins.
Replacing Sync with a transactional source of truth and reconciliation protocol is outside
this refactor.
