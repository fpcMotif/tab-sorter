# 02 — Move the ordering planners (domain, sort, window-order plan, match, dedupe, domain-groups)

**What to build:** All six ordering planners run from core entry points with their suites plus the efficiency suite; the extension consumes them via specifiers with zero behavior change; the match safety cap travels with the matcher (ADR-0001).

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Six modules + tests + efficiency suite live in core; all import sites rewritten
- [ ] All gates green (check-types, test, lint incl. boundaries, build)
- [ ] No behavior change; no export surface changes
