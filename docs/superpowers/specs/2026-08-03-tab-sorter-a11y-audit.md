# Tab Sorter Accessibility (a11y) Audit & Remediation Spec

## Overview & Methodology

Automated WCAG 2.1 AA accessibility audit executed using `agent-browser@0.33.2` with embedded `axe-core 4.12.1` attached via Chrome DevTools Protocol (`--cdp ws://[::1]:9222/devtools/browser/...`) directly to the live **Tab Sorter** extension (`extensionId: ooigmlecjgnbiicjbkkecflhgikaoiop`).

---

## Verified Audit Results (`axe-core 4.12.1`)

### 1. Tab Sorter Popup (`chrome-extension://ooigmlecjgnbiicjbkkecflhgikaoiop/popup.html`)
- **Verified URL**: `chrome-extension://ooigmlecjgnbiicjbkkecflhgikaoiop/popup.html`
- **Passes**: `28` rules
- **Violations**: `0`
- **Incomplete**: `1` (`color-contrast` evaluation for non-text shortcut keys and dynamic background layers)

### 2. Tab Sorter Options (`chrome-extension://ooigmlecjgnbiicjbkkecflhgikaoiop/options.html`)
- **Verified URL**: `chrome-extension://ooigmlecjgnbiicjbkkecflhgikaoiop/options.html`
- **Passes**: `30` rules
- **Violations**: `0`
- **Incomplete**: `1` (`color-contrast` background gradient evaluation on `<h1>Tab Sorter settings</h1>`, `.header-sub`, and `.footer-mark`)

---

## Remediations Applied

1. **Semantic Heading Hierarchy (`apps/extension/entrypoints/popup/App.tsx`)**:
   - Converted app branding title `<span className="app-name">Tab Sorter</span>` to `<h1 className="app-name">Tab Sorter</h1>` to establish a top-level `<h1>` landmark.
   - Converted domain section heading `<h3 className="section-label">Extract a domain</h3>` to `<h2 className="section-label">Extract a domain</h2>` to preserve strict sequential heading hierarchy (`<h1>` → `<h2>`).

2. **Styling Normalization (`apps/extension/entrypoints/popup/App.css`)**:
   - Added `margin: 0` to `.app-name` to preserve layout geometry after upgrading to `<h1>`.

---

## Verification Summary

- **Accessibility Audit**: `0` violations on both `popup.html` and `options.html` (`a11y --json`).
- **Unit Tests**: `365/365` tests passing (`bun run test`).
- **Type Safety & Linting**: `0` diagnostics (`bun run check-types && bun run lint`).
