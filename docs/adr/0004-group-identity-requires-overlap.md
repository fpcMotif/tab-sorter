# ADR-0004: Group identity requires member overlap

- **Status:** Accepted
- **Date:** 2026-07-15

Private group reconciliation in `lib/mutation-realize.ts` matches a desired group to a live
group only when they share members. Greatest overlap wins; lowest group id breaks ties. Equal
title with zero overlap does not prove identity: Chrome exposes no extension-ownership marker.
Title fallback could capture and mutate a manual group. Persisted ownership would add stale
state and recovery rules with no current need. A duplicate group is safer than mutating the
wrong group.
