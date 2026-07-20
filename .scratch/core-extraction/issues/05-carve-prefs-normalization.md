# 05 — Carve prefs-normalization into core

**What to build:** The pure prefs piece (normalizer, bounds, defaults) is a core entry point. The storage adapter keeps only chrome.storage I/O, the FIFO write tail, and the change listener, importing the normalizer from core. The defaults round-trip assertion moves into core beside the normalizer.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Normalization + bounds exported from core; storage adapter consumes them
- [ ] Round-trip assertion lives in core tests; temporary app-side copy removed
- [ ] All gates green; prefs behavior byte-identical
