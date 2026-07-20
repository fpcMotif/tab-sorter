# 03 — Move the Layer-1 planners (tidy, undo, tab-moves) + invariants suite

**What to build:** Every TabPlan producer lives in core; the invariants property suite moves wholesale (all its targets are now in core); the executor consumes the planners app-side unchanged. TabPlan/GroupSpec shapes untouched; GroupSpec keys stay producer-supplied.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] tidy, undo, tab-moves + their tests + invariants suite in core; imports rewritten
- [ ] All gates green; zero behavior change
