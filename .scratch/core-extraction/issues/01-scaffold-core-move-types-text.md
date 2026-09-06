# 01 — Scaffold @tab-sorter/core and prove the regime with the leaf moves (types, text)

**What to build:** The core package exists as a real workspace member (exports map, strict tsconfig, vitest with a 100% coverage gate, scripts picked up by the root fan-outs). The shared types/constants and text comparison live in core as root entry points; every extension import site uses the `@tab-sorter/core/<entry>` specifier; a direct text-comparison test is backfilled. Dependency-cruiser demonstrably sees workspace-specifier imports as real package paths — the boundary regime is proven for specifiers, or nothing else proceeds.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `bun run check-types`, `bun run test`, `bun run lint` (incl. boundaries), `bun run build` all green
- [x] Depcruise output shows real-path edges from extension files to core entry points
- [x] A deliberate deep import fails the boundary check (then reverted); resolution behavior for specifier deep imports reported
- [x] Prefs round-trip assertion relocated app-side (temporary home until ticket 05)
- [x] Text comparison has direct tests; core coverage gate at 100%
