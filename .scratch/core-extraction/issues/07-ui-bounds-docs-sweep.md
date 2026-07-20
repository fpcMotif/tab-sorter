# 07 — Options UI consumes core bounds + docs sweep

**What to build:** The options UI's duplicated min-group-size rule is deleted in favor of the core bounds export. CONTEXT.md and the packages README reflect where the vocabulary now lives (core entry points instead of lib paths). Final full-gate verification of the finished state.

**Blocked by:** 03, 04, 05.

**Status:** ready-for-agent

- [ ] Options UI imports bounds from core; duplicate constants/parse logic gone
- [ ] CONTEXT.md module references updated; packages README mentions core
- [ ] Full suite + typecheck + boundaries + build green from a clean checkout
