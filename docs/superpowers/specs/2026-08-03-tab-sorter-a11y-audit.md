# Tab Sorter Accessibility (a11y) Audit & Remediation Guide

## 1. Summary of Changes

We completed an accessibility audit for Tab Sorter (`extensionId: ooigmlecjgnbiicjbkkecflhgikaoiop`) using `agent-browser@0.33.2` with `axe-core 4.12.1` over CDP port 9222.

### Code & CSS Changes
- **App Heading (`App.tsx`)**: Replaced `<span className="app-name">Tab Sorter</span>` with `<h1 className="app-name">Tab Sorter</h1>`.
- **Heading Level Order (`App.tsx`)**: Replaced `<h3 className="section-label">Extract a domain</h3>` with `<h2 className="section-label">Extract a domain</h2>`.
- **Heading Margin (`App.css`)**: Added `margin: 0` to `.app-name` to keep identical visual spacing.
- **Text Contrast (`tokens.css`)**: Darkened `--hero-kbd-bg` overlay to `hsl(220 60% 10% / 0.22)` to raise 11px `<kbd>` text contrast ratio from 3.31:1 to **6.15:1** (exceeding the WCAG 1.4.3 Level AA 4.5:1 requirement).

---

## 2. Technical Explanation & Why Previous Code Was Bad Practice

### Element Replacements Applied
1. **`<span>` → `<h1>` for App Title**:
   - *Previous Code*: The app title used `<span className="app-name">Tab Sorter</span>`.
   - *Why It Was Bad*: A `<span>` is a generic inline container with no semantic meaning. Screen reader software reads document headings (`<h1>`-`<h6>`) to give users an overview of page structure. Without an `<h1>`, screen readers cannot find the main title heading of the page.
2. **`<h3>` → `<h2>` for Section Title**:
   - *Previous Sequence*: The page had no `<h1>` and contained an `<h3>` for the domain section.
   - *Chronological Sequence*: Adding the new `<h1>` for the app title caused the existing `<h3>` to skip a heading level (`<h1>` → `<h3>`).
   - *Why It Was Fixed*: Upgrading `<h3>` to `<h2>` established a strict sequential heading order (`<h1>` → `<h2>`). Screen readers rely on sequential heading hierarchy to navigate page sections without skipping levels.

---

## 3. Why Junior Developers Make Bad Choices

1. **Choosing Tags by Visual Size**: Junior developers often pick HTML tags based on default browser font size rather than structural meaning.
2. **Avoiding CSS Resets**: Browser default headings (`<h1>`, `<h2>`) come with default top/bottom margins. Developers sometimes use `<span>` or `<div>` to avoid writing CSS margin resets.
3. **Misunderstanding Document Structure**: Developers may confuse headings (which label section boundaries) with list items (which hold collections of data).

---

## 4. Headings (`<h1>`, `<h2>`) vs. List Items (`<li>`)

- **Headings (`<h1>`, `<h2>`)**:
  - *Purpose*: Label structural section titles of a document.
  - *Usage*: Use `<h1>` for the main page title. Use `<h2>` for major section titles that follow `<h1>`.
  - *Rule*: Keep heading hierarchy sequential (`<h1>` → `<h2>` → `<h3>`).
- **List Items (`<li>`)**:
  - *Purpose*: Group collections of related data items inside `<ul>` or `<ol>`.
  - *Usage*: `<ul>`/`<li>` elements are kept for item collections, such as the list of extracted domain rows. `<li>` elements are not used for section titles.

---

## 5. Audit Results & Contrast Verification

- **Popup (`popup.html`)**: `0` violations (`28` passing rules in tested states). `<kbd>` 11px text contrast ratio is **6.15:1** (WCAG 1.4.3 4.5:1 requirement met).
- **Options (`options.html`)**: `0` violations (`30` passing rules in tested states). Heading contrast ratio is **13.8:1** (WCAG 1.4.3 4.5:1 requirement met).
- **Incomplete Checks**: Axe-core marked contrast evaluation as `incomplete` on dynamic overlays and gradients. Manual contrast calculations verified all text meets WCAG 2.1 AA thresholds.
- **Test Suite**: 365 vitest unit tests passing (`bun run test`).
- **Type Safety**: 0 diagnostics (`bun run check-types && bun run lint`).
