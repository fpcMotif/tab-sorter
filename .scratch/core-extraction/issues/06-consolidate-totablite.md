# 06 — Consolidate the raw-tab→TabLite mapping app-side

**What to build:** Exactly one raw-browser-tab→TabLite mapping exists, in the tabs service, consumed by the mutation transaction module. The two current near-duplicate copies (differing in a pendingUrl fallback) are reconciled deliberately — pick the correct fallback semantics and document why. Raw browser shapes still never enter core.

**Blocked by:** None — independent parallel track (serialize with 01–03 only to avoid edit conflicts in the transaction module).

**Status:** ready-for-agent

- [ ] One mapping, one home; both former call sites consume it
- [ ] Fallback semantics decision recorded in the commit message
- [ ] All gates green; existing mutation/tabs-service suites unchanged and passing
