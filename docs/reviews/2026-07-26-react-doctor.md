# React Doctor triage — 2026-07-26

Command: `bunx react-doctor@latest --yes --verbose`

Version: React Doctor 0.9.1

Baseline: 72/100. 20 warnings: 18 performance, 2 maintainability.

## Triage

| # | Finding | Verdict | Confidence | Action |
|---:|---|---|---|---|
| 1 | `options/App.tsx:249` giant component | True positive | High | Defer. Split stateful controller from sorting, tidy, dedupe, presets, and shortcuts views in a UI-only change. |
| 2 | `popup/App.tsx:428` giant component | True positive | High | Defer. Split mutation controller from action, extract, export, and status views in a UI-only change. |
| 3 | `mutation-realize.ts:51` array lookup in loop | True positive | High | Fix with a live-tab ID set. |
| 4 | `mutation-realize.ts:129` chained iterations | True positive | High | Build live group membership in one strip pass. |
| 5 | `mutation-realize.ts:132` chained iterations | True positive | High | Build survivor and pinned sets in the same strip pass. |
| 6 | `mutation-realize.ts:133` chained iterations | True positive | High | Filter desired group members in one pass. |
| 7 | `mutation-realize.ts:145` await in loop | False positive | High | Keep serial. Group claims and Chrome group mutations share live membership. |
| 8 | `mutation-realize.ts:189` chained iterations | True positive | High | Build pinned IDs and order in one pass. |
| 9 | `mutation-realize.ts:191` chained iterations | True positive | High | Same fix as #8. |
| 10 | `mutation-realize.ts:195` await in loop | False positive | High | Keep serial. Each indexed move changes the next move's coordinates. |
| 11 | `mutation-realize.ts:207` chained iterations | True positive | High | Index current group members once after pinned moves. |
| 12 | `mutation-realize.ts:211` find in loop | True positive | High | Index group span starts with group members. |
| 13 | `mutation-realize.ts:215` await in loop | False positive | High | Keep serial. Each member move changes the simulated strip used by the next move. |
| 14 | `mutation.ts:242` chained iterations | True positive | High | Collect created groups in one pass. |
| 15 | `mutation.ts:265` array lookup in loop | True positive | High | Build a planned-close ID set. |
| 16 | `mutation.ts:477` chained iterations | True positive | High | Use one recovery-candidate predicate. |
| 17 | `mutation.ts:541` await in loop | False positive | High | Keep serial. The journal must be durable before each tab creation. |
| 18 | `mutation.ts:712` await in loop | True positive | High | Load independent per-window histories together. |
| 19 | `runtime.ts:56` array lookup in loop | False positive | High | Keep the array. Protocol key lists and request envelopes are tiny; constructing a set costs more. |
| 20 | `tabs-service.ts:94` await in loop | False positive | High | Keep serial. Appending concurrent Chrome tab moves can reorder tabs. |

## Fix boundary

Fix the 12 high-confidence performance findings. Preserve the six ordered or
bounded operations. Leave the two component splits for focused UI work with
interaction tests.

## Post-fix verification

React Doctor 0.9.1 reports 8 warnings: the six false positives and two deferred
component splits above. The 12 targeted warnings are gone.

The pinned 0.5.6 blocking gate reports 3 warnings and stays red. Types, lint,
module boundaries, formatting, 365 tests, and the Chrome build pass.
