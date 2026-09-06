# 04 — Move protocol-error and export

**What to build:** The last two pure modules live in core. Protocol error codes gain their first direct tests (pre-existing coverage gap); export formatting moves with its suite.

**Blocked by:** 02 (export needs domain).

**Status:** ready-for-agent

- [x] Both modules in core as root entry points; imports rewritten (storage/runtime consume protocol-error from core)
- [x] Protocol-error direct tests added; core coverage gate still 100%
- [x] All gates green
