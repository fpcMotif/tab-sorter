# Tab Sorter — Final Design Spec

Status: implementable. Source files: `popup.html`, `settings.html` in this directory are the canonical, self-contained reference build (open either directly in a browser — no server, no build step). This document is the spec behind them: tokens, type/spacing scale, per-component states, motion, copy rules, and — in the last section — the exact class-level diff against the current React implementation in `apps/extension`.

## 0. Winner and what changed

The judge panel scored four concepts — `chrome-native` (157), `warm-editorial` (154), `tactile-soft` (148), `utility-dense` (146) — across three independent lenses (popup ergonomics, code-level craft/a11y, brand/feel). **Chrome Native+ won**: it was the only concept that actually modeled Chrome's real popup height ceiling (`max-height: 508px` on the scroll region), had the best-verified contrast margins in both themes (its GM3 tonal-surface system re-tunes dark mode instead of just dimming it), and used Chrome's own 9 real tab-group hues as both decoration and information.

It lost points for three concrete, fixable problems, all fixed here:
1. **Zero working JavaScript.** Every interaction in the canonical popup.html (dedupe arm/disarm, disclosure toggle, copy chips) was a separately hard-coded static card, not one popup proven to transition between states.
2. **`<li class="domain-row" tabindex="0">`** — a focusable list item with no `role="button"` and no keydown handler, so a keyboard user can tab to it but not activate it.
3. **Missing blanket heading/paragraph margin reset** (only `html,body{margin:0}` existed) and a missing `<html lang="en">` on `popup.html` (present on `settings.html` but not its own popup).

Three ideas were grafted in from the runners-up because they measurably strengthen the winner without touching its identity:
- **Utility Dense** — keyboard-shortcut chips embedded directly on the hero button (`⌥⇧Space`) and the A→Z sort chip (`⌥⇧T`), `font-variant-numeric: tabular-nums` on every count, and group-color dots echoed inline in the success toast.
- **Warm Editorial** — `autofocus` on the hero Tidy button (Enter fires Tidy the instant the popup opens) and real `<label><input type="checkbox"></label>` switches in Settings instead of hand-rolled `<button role="switch">`.
- **Tactile Soft** — the live regex tester: `new RegExp(pattern, flags)` run against a realistic demo tab set on every keystroke, so the pattern-disclosure's match count is computed, not hard-coded.

One gap the judges flagged across *all four* concepts is also fixed here: the toast now sits in a persistent `role="status" aria-live="polite"` container (`role="alert" aria-live="assertive"` for the error variant), so screen-reader users hear "Grouped 18 tabs…" the moment it happens.

---

## 1. Design tokens

All values are CSS custom properties on `:root`, overridden under `@media (prefers-color-scheme: dark)`. Both HTML files define the same token set; `settings.html` additionally defines `--page-bg`, `--warning-container`/`--on-warning-container`, and `--success-container`/`--on-success-container` for its save-indicator and warning-note. Group-color tokens (`--g-*`) map 1:1 onto `GroupColor` in `apps/extension/lib/types.ts`.

### 1.1 Surfaces & text

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--surface` | `#FFFFFF` | `#131314` | base page/card fill |
| `--surface-container-lowest` | `#FFFFFF` | `#0E0E0E` | popup frame, lowest tonal step |
| `--surface-container-low` | `#F8FAFD` | `#1B1B1B` | dedupe row, hover fill, regex input |
| `--surface-container` | `#F0F4F9` | `#1E1F20` | reserved tonal step |
| `--surface-container-high` | `#E9EEF6` | `#282A2C` | count badge, kbd chip, icon-btn hover |
| `--surface-container-highest` | `#E3E8F0` | `#333537` | reserved tonal step |
| `--on-surface` | `#1F1F1F` | `#E3E3E3` | primary text |
| `--on-surface-variant` | `#444746` | `#C4C7C5` | secondary text, icons, labels — verified ≥7:1 on every surface it sits on in both themes |
| `--outline` | `#747775` | `#8E918F` | outline-style button borders |
| `--outline-variant` | `#C4C7C5` | `#444746` | hairlines, input borders |

### 1.2 Primary (accent)

| Token | Light | Dark |
|---|---|---|
| `--primary` | `#0B57D0` | `#A8C7FA` |
| `--on-primary` | `#FFFFFF` | `#062E6F` |
| `--primary-container` | `#D3E3FD` | `#0842A0` |
| `--on-primary-container` | `#041E49` | `#D3E3FD` |

Dark mode does not just dim `--primary` — it swaps to a *lighter, more saturated* blue with dark-navy text on top (GM3 dynamic-color convention), which is why `--hero-kbd-bg`/`--hero-kbd-border` (the translucent overlay behind the on-hero kbd chips) also flips from a white overlay to a dark overlay in dark mode (see §4.1) — same recipe, opposite direction, so the chips still read as "recessed" against the hero regardless of theme.

### 1.3 Semantic (error / warning / success)

| Token | Light | Dark |
|---|---|---|
| `--error` | `#B3261E` | `#F2B8B5` |
| `--on-error` | `#FFFFFF` | `#601410` |
| `--error-container` | `#F9DEDC` | `#8C1D18` |
| `--on-error-container` | `#410E0B` | `#F9DEDC` |
| `--warning-container` *(settings only)* | `#FEF7E0` | `#7B5900` |
| `--on-warning-container` *(settings only)* | `#7B5900` | `#FEEFC3` |
| `--success-container` *(settings only)* | `#E6F4EA` | `#0D652D` |
| `--on-success-container` *(settings only)* | `#0D652D` | `#CEEAD6` |

The success **toast** in the popup uses `--g-green-bg`/`--g-green-fg` (below) rather than a dedicated success token, so a toast visually matches the "green" tab-group family.

### 1.4 The 9 tab-group colors (`GroupColor`)

Each has a dot, a soft background, and an on-that-background foreground — dot for domain-row identity, bg/fg pair for anything that needs a filled chip (not used in the current popup, reserved for future group chips).

| Color | dot (light) | bg (light) | fg (light) | dot (dark) | bg (dark) | fg (dark) |
|---|---|---|---|---|---|---|
| grey | `#5F6368` | `#E8EAED` | `#3C4043` | `#9AA0A6` | `#3C4043` | `#DADCE0` |
| blue | `#1A73E8` | `#D2E3FC` | `#0842A0` | `#8AB4F8` | `#0842A0` | `#D2E3FC` |
| red | `#D93025` | `#FCE8E6` | `#A50E0E` | `#F28B82` | `#8C1D18` | `#FADAD7` |
| yellow | `#F29900` | `#FEF7E0` | `#7B5900` | `#FDD663` | `#7B5900` | `#FEEFC3` |
| green | `#1E8E3E` | `#E6F4EA` | `#0D652D` | `#81C995` | `#0D652D` | `#CEEAD6` |
| pink | `#D01884` | `#FCE4EC` | `#7A0D4B` | `#FF8BCB` | `#7A0D4B` | `#FFD7EC` |
| purple | `#A142F4` | `#F3E8FD` | `#5E2B97` | `#C58AF9` | `#5E2B97` | `#EAD9FC` |
| cyan | `#12B5CB` | `#E0F7FA` | `#05707D` | `#78D9EC` | `#05707D` | `#CBF0F8` |
| orange | `#FA903E` | `#FEF0E6` | `#8C3900` | `#FCAD70` | `#8C3900` | `#FDDBBD` |

### 1.5 Elevation, shape, motion

| Token | Value | Notes |
|---|---|---|
| `--shadow-color` | `220 20% 20%` light / `220 40% 2%` dark | HSL triplet consumed by the elevation shadows below |
| `--elevation-1` | `0 1px 2px hsl(var(--shadow-color)/.30), 0 1px 3px 1px hsl(var(--shadow-color)/.15)` | hero button, armed danger button |
| `--elevation-3` | `0 4px 8px 3px hsl(var(--shadow-color)/.15), 0 1px 3px hsl(var(--shadow-color)/.30)` | the floating popup frame itself — the *only* place a heavier shadow is allowed; everything inside the popup uses tonal surface steps, not shadows |
| `--ease` | `cubic-bezier(.2,0,0,1)` | the one motion curve in the whole system |
| `--dur` | `140ms` | the one duration in the whole system, gated by `prefers-reduced-motion` (see §5) |
| Radii | `10px` domain row / `12px` disclosure row, warning-note / `14px` dedupe row, toast / `16px` popup frame / `18–20px` pill buttons, chips / `50%` circular icon buttons | no bespoke radius per component beyond this list |

---

## 2. Type scale

One sans stack (`--font-sans`: Google Sans Text → Roboto → system) for everything interactive and for body copy; one display cut (`--font-display`: Google Sans → Roboto → system) reserved for the app name, hero title, section headings (`h2`, `h3`), and the settings `h1` — display and body converge on the same fallback stack so nothing breaks without the Google fonts installed, but `font-weight: 500` on the display slots is what actually carries the "this is a heading" signal. `--font-mono` (`ui-monospace` → SF Mono → Menlo → Consolas) is reserved strictly for regex patterns and preset-pattern chips — never for counts (those get `--font-sans` + `tabular-nums`, see below).

| Step | Size | Weight | Font | Example |
|---|---|---|---|---|
| Page title | 22px | 500 | display | Settings `h1` |
| Section heading | 15.5px | 500 | display | `.settings-section h2` |
| Hero / app name | 14.5–15px | 500 | display | `.hero-title`, `.app-name`, `.empty-title` |
| Body / control label | 13–13.5px | 400–500 | sans | `.pref-text label`, domain name, shortcut row |
| Secondary / facts | 12–12.5px | 400–500 | sans | `.facts-line`, `.consequence`, `.dedupe-text` |
| Micro / hint | 11–11.5px | 500 | sans | `.section-label` (uppercase, `.05em` tracking), `.armed-hint`, `.preset-flags` |
| Kbd / smallest | 10–10.5px | 400 | sans | `kbd` glyphs |

Numerals: anywhere a count appears (`.facts-line`, `.count-badge`, `.match-count`, `.domain-count`, preset flags) gets `font-variant-numeric: tabular-nums` so digits never jiggle when a count changes live — this is the Utility Dense graft, applied uniformly.

---

## 3. Spacing scale

A single scale drives every gap, padding, and margin in both files — no bespoke one-off values outside it:

```
2  4  6  8  9  10  12  14  16  18  20  22  24  28  32   (px)
```

Component padding conventions:
- Pill buttons (`.hero-tidy`, `.chip-btn`, `.btn-outline`, `.undo-pill`): `7–11px` vertical, `14–18px` horizontal.
- Rows (`.domain-row`, `.dedupe-row`, `.disclosure-row`, `.pref-row`): `7–14px` vertical padding, content gap `8–10px`.
- Cards (`.settings-section`): `6px 22px 10px` outer, `14px 0` per `.pref-row`, hairline between rows via `border-top`.
- The popup's own scroll region (`.popup-scroll`) pads `8px 14px 14px` and stacks children with a flat `gap: 14px` — this, plus the blanket `h1,h2,h3,p,ul,ol{margin:0}` reset, is what keeps the canonical popup at **≈503–510px total** (header + facts line + capped 508px scroll body), inside the ~520px doctrine target with room to spare even after grafting in kbd chips and the live regex tester.

---

## 4. Component specs

### 4.1 Hero button (`.hero-tidy`)

The one primary action in the popup. `background: var(--primary)`, fully rounded (`border-radius: 28px`), `autofocus` so `Enter` fires Tidy the instant the popup opens.

- **Anatomy**: circular icon badge (translucent white circle, sparkle glyph) → title + subtitle stack (`flex:1`, pushes the next element to the far edge) → `.hero-keys` (kbd chips, right-aligned, translucent overlay).
- **Default**: `box-shadow: var(--elevation-1)`.
- **Hover**: `filter: brightness(1.06)`.
- **Active**: `transform: scale(.98)`.
- **Focus-visible**: `outline: 2px solid var(--on-primary-container)`, offset `2px` — deliberately the *container* ink color, not the primary itself, so the ring is visible against the primary fill.
- **Disabled / loading**: `disabled`, icon swaps to a spinning ring (`.spin`, gated by `prefers-reduced-motion`), title → "Tidying window…", subtitle → "Sorting and grouping by site". No layout shift — same slots, new content.
- **On-hero kbd chips** (`.hero-keys kbd`): background `--hero-kbd-bg` / border `--hero-kbd-border` — light-mode values are a translucent **white** overlay (`hsl(0 0% 100% / .18)` / `.32`); dark-mode values are a translucent **dark-navy** overlay (`hsl(220 60% 10% / .16)` / `.26`), because in dark mode the hero's own text (`--on-primary`) is dark navy on a light-blue fill — a dark overlay reads as "recessed" the same way the light overlay does in light mode. Text color always `var(--on-primary)`.

### 4.2 Chip / segmented buttons

Two distinct patterns share a look but not a role:

- **`.chip-btn`** (popup sort row) — momentary actions, not a persisted selection. Neutral outline (`--outline-variant`), no "active" state. The A→Z chip alone carries a kbd hint (`⌥⇧T`) because it's the only sort mode with its own global shortcut; "By domain" doesn't get one.
- **`.segmented`** (settings: Default sort, Group order) — a real persisted choice. One button always carries `.is-selected` (`background: var(--primary-container)`, `color: var(--on-primary-container)`); clicking any button in the group moves the state and triggers the quiet "Saved." flash (§4.9).

Both: `:focus-visible{outline:2px solid var(--primary)}`, `:hover{background:var(--surface-container-high)}` (chip) or `background:var(--surface-container-high)` on non-selected segmented buttons.

### 4.3 Two-step danger button (`.btn-outline` → `.btn-danger-armed`)

The **only** destructive control in the popup ("Close N duplicates"), and the only place a modal is explicitly forbidden by doctrine.

| State | Class | Label | Behavior |
|---|---|---|---|
| Resting | `.btn-outline` | `Close 3 duplicates` | Count is in the resting label per doctrine — never just "Close duplicates" |
| Armed | `.btn-danger-armed` | `Close 3 duplicates?` | First click. Background flips to `--error`/`--on-error`. A `.armed-hint` paragraph appears below ("Press again to confirm — closes the newer copy of each"), `color: var(--on-surface-variant)` (verified ≥7:1 in both themes — this replaces Utility Dense's `--text-faint` token, which failed AA at 2.28:1/3.63:1 in exactly this spot). A 4-second timer starts. |
| Executed | *(row removed)* | — | Second click. Row is removed from the DOM, a success toast replaces it ("Closed 3 duplicates"), facts-line duplicate count drops to 0. |
| Disarmed | `.btn-outline` | `Close 3 duplicates` | `Esc` key (global listener) or the 4s timer, whichever comes first. No confirmation needed to cancel — cancelling is always free. |

### 4.4 Inputs: regex field, flag chips, stepper

- **Regex input** (`.regex-input`): `--font-mono`, `border:1px solid var(--outline-variant)`, `background:var(--surface-container-low)`. Invalid state: `.is-invalid{border-color:var(--error)}`, paired with `.match-count.is-invalid{color:var(--error)}` and the Move button disabled. Wired to a **live** regex test (see §4.7) — never a hard-coded match count.
- **Flag chips** (`.flag-chip`): toggle buttons, not checkboxes — `aria-pressed` reflects state, `.on{background:var(--primary-container)}` when active. Two flags in this build: *Case-insensitive* (adds the `i` flag) and *Match full URL* (tests the pattern against the full tab URL instead of just the hostname).
- **Stepper** (`.stepper`, settings only): circular −/+ buttons around a `tabular-nums` value. Disable the relevant button at `data-min`/`data-max` rather than letting it wrap or no-op silently.

### 4.5 Domain row (`.domain-row`)

A real `<button>` (not a focusable `<li>`) inside a plain `<ul>` — this is the fix for the winner's one real semantic bug. Anatomy: color dot (one of the 9 `GroupColor` dots) → domain name (ellipsis-truncated) → reveal-on-hover "open in new" glyph → tabular-nums count badge. `width:100%; text-align:left; background:transparent; border:none` so it behaves like a row, not a default button chrome. `:hover{background:var(--surface-container-low)}`, `:focus-visible{outline:2px solid var(--primary); outline-offset:-1px}` (inset, so the ring doesn't get clipped by the list's overflow).

### 4.6 Undo pill (`.undo-pill`)

Appears **only** after an action that produced a snapshot, sits directly in the toast slot above the hero (not bolted onto the toast itself, so it persists independently of the toast's own dismissal). Pill shape, `--primary-container` fill, undo-arrow glyph, label, and a trailing `⌥⇧Z` kbd chip. Clicking it removes itself, clears the toast, and reverts the facts-line back to its pre-action wording.

### 4.7 Toasts (`.toast`)

Sit in a **persistent** `#toastSlot` container with `role="status" aria-live="polite"` (error variant: `role="alert" aria-live="assertive"`) so assistive tech announces the content the instant it's set — this is the fix for the one gap every one of the four concepts shared.

- **Success**: `background:var(--g-green-bg); color:var(--g-green-fg)`, check-circle glyph, bold headline + tail ("Grouped 18 tabs into 5 groups · 12 moved"), optional inline `.group-dots` (5 small dots in the exact colors just assigned — the Utility Dense graft), dismiss button.
- **Error**: `background:var(--error-container); color:var(--on-error-container)`, warning-triangle glyph, headline names the count and the actual reason ("Couldn't move 2 tabs — unpin them first"), dismiss button.
- Never auto-dismiss a toast that's reporting an error; success toasts may be dismissed by the user or superseded by the next action.

### 4.8 Disclosure (`.disclosure-row` + `.pattern-panel`)

Collapsed by default (progressive disclosure per doctrine). `aria-expanded` on the trigger, `aria-controls` pointing at the panel id, chevron rotates 180° via `[aria-expanded="true"] .chevron{transform:rotate(180deg)}`. The panel itself (`hidden` attribute, not `display:none` in a stylesheet — cheaper to toggle, correct default a11y semantics) contains the regex field, flag chips, live match count, preset chips, and the Move button — all wired together by one `recomputeMatches()` function so every input (typing, flag toggle, preset click) re-runs the same live test against the same demo tab set.

### 4.9 Section card (`.settings-section`) and live-save

Each settings section is a single card: `border:1px solid var(--outline-variant); border-radius:20px`, heading flush to the top padding, `.pref-row`s separated by hairlines (`border-top`, first row's border suppressed via the adjacent-sibling rule so the heading doesn't get a double rule). Every `.pref-row` is *label + one muted consequence sentence + control* — never a bare toggle with no explanation. The risky preference (`Also regroup tabs already in groups`) is followed by a `.warning-note` that is **always visible**, not conditional on the toggle's state.

**Switches** (`.switch`) are real `<label><input type="checkbox"><span class="track"></span></label>` — not a hand-rolled `<button role="switch" aria-checked>`. The checkbox is visually hidden (`opacity:0`, full-size, on top of the track) but keeps native semantics: `Space` toggles it for free, and its accessible name comes from the `<label for>` / `aria-labelledby` wiring to the *visible* pref-text label rather than a duplicated `aria-label` string.

**Live-save**: every control (switches, segmented buttons, stepper, preset add/delete) calls one `flashSaved()` function that adds `.is-visible` to `#saveIndicator` (fading it in) and clears/restarts a 1.6s timer that fades it back out — "quiet 'Saved.'" per doctrine, not a permanently-parked chip.

### 4.10 Kbd chip (`kbd`)

Global element style: `background:var(--surface-container-high); border:1px solid var(--outline-variant); color:var(--on-surface-variant); border-radius:5px; padding:2px 5px; font-size:10–12px`. Used standalone in the Settings shortcuts list, and nested inside `.hero-keys` (overlay variant, §4.1), `.chip-btn` (A→Z), and `.undo-pill`.

---

## 5. Motion

One easing curve (`--ease: cubic-bezier(.2,0,0,1)`), one duration (`--dur: 140ms`), applied only to **state changes** — background/border/color/transform on hover, active, arm/disarm, disclosure expand, chevron rotation. Never used for entrance flourishes or anything that isn't a direct response to input. The disclosure panel's `expand` keyframe (opacity + 4px translateY) is the one exception, and it's still 140ms.

Everything is wrapped in:

```css
@media (prefers-reduced-motion: reduce){
  *{ animation-duration:.001ms !important; transition-duration:.001ms !important; }
}
```

Loading spinners (hero icon while tidying, popup's own loading-state spinner) are the one place motion communicates *state* rather than *feedback* — they still collapse to a static frame under reduced motion rather than looping.

---

## 6. Copy guidelines

- Sentence case everywhere. No exclamation marks, anywhere, including toasts and errors.
- Every count-bearing action names the count in its resting label, not just once armed: **"Close 3 duplicates"**, not "Close duplicates" → "Close 3 duplicates?" (a real compliance slip in one of the runner-up concepts).
- Toast headlines report **what happened**, not what was attempted: "Grouped 18 tabs into 5 groups · 12 moved", "Closed 3 duplicates", "Couldn't move 2 tabs — unpin them first". The error case always names the actual blocking reason when one is known.
- Consequence sentences in Settings are muted, factual, and describe an effect, not an instruction: "Pinned tabs stay in place and are never moved or grouped." — never "Enable this to keep pinned tabs in place."
- The one warning line in Settings states the mechanism, not just "be careful": "Turning this on reshuffles groups you made by hand — Tab Sorter can't tell them apart from its own."
- Empty and loading states are specific to the popup's actual doctrine ("make this window make sense"): "Nothing to tidy — this window has 1 tab. Open a few more and Tab Sorter will find a shape worth grouping," not a generic "No data."

---

## 7. Mapping onto the codebase

This section is documentation only — no file outside `docs/design/final/` was edited to produce it. It describes how an implementer would carry this design into `apps/extension`.

### 7.1 `apps/extension/assets/tokens.css`

The current file is a leftover Warm Editorial token set (`--bg`, `--surface`, `--accent`, Georgia display font, terracotta accent) that predates this synthesis and isn't actually consumed by the current `App.css` files (they hardcode their own hex values instead of referencing it — see 7.2). Replace its entire contents with the token table in §1 of this document: same `:root` block + the single `@media (prefers-color-scheme: dark)` override, renamed to the GM3-style names used throughout `popup.html`/`settings.html` (`--surface-container-*`, `--primary`, `--on-primary`, `--g-*-dot/bg/fg`, etc.). Both `popup/App.css` and `options/App.css` should then reference these custom properties instead of hardcoded hex.

### 7.2 `apps/extension/entrypoints/popup/App.css` + `App.tsx`

The current `App.tsx` (reducer-based, sort/copy/extract only) predates the Tidy/Dedupe/Undo Layer-1 features that already exist as pure logic in `apps/extension/lib/` (`tidy.ts` → `planTidy`, `dedupe.ts` → `planDedupe`, `undo.ts` → `planUndo`, `group-ops.ts` → `planGroupOps`, `session-store.ts` → `saveUndo`/`loadUndo`/`clearUndo`) but isn't wired into the popup UI yet. This design assumes that wiring happens; the class-level mapping below covers both the **visual restyle of what exists today** and **the new markup the Tidy/Dedupe/Undo surfaces need**.

| Current class (App.tsx / App.css) | Final design equivalent | Notes |
|---|---|---|
| `.popup-shell` (grid, 16px pad) | `.popup-scroll` inside a `.popup-frame` | Needs the `max-height:508px; overflow-y:auto` cap — this is the single biggest layout fix; currently unbounded. |
| `.eyebrow` ("Tab Sorter" small-caps label) | `.header` (`.app-icon` + `.app-name`) | Header becomes icon-mark + name + settings gear, not a stacked eyebrow/h1. |
| bare `<h1>Clean up this window</h1>` | *(removed)* | Replaced by the `.facts-line` ("N tabs · N sites · N duplicates") directly under the header — the doctrine's "read the window before you act" line. The hero button's own title carries the verb now. |
| `.panel` (bordered card, used for every section) | *(mostly removed)* | Sections in the final popup are **not** individually bordered/shadowed cards — `hr.rule` hairlines + `.section-label` do the separation. Reserve `.panel`-style cards for nothing in the popup; the popup should read as one flat scroll, not eight stacked cards (this was the specific ergonomics win that made a competing concept the runner-up in the hierarchy lens). |
| `.button-row` (Sort tabs) | `.sort-row` + `.chip-btn` | Add the `⌥⇧T` kbd chip to A-to-Z only. Needs a new hero button above it (`.hero-tidy`, wired to `planTidy`/`planGroupOps`/`saveUndo`) — Tidy doesn't exist in current `App.tsx` yet. |
| *(no dedupe UI yet)* | `.dedupe-row` + `.btn-outline`/`.btn-danger-armed` + `.armed-hint` | New. Wires to `planDedupe`. Two-step arm/execute state per §4.3; `dedupeIgnoreHash`/`dedupeIgnoreQuery` prefs already exist on `Prefs` (`lib/types.ts`) and map directly onto the Settings "Duplicates" section. |
| `.domain-list` / `.domain-button` | `.domain-list` (`<ul>`) / `.domain-row` (`<button>`) | Rename `.domain-button` → `.domain-row`; add the `GroupColor`-driven dot (`assignColor()` in `lib/tidy.ts` already produces the color to use here) and a tabular-nums `.count-badge`. |
| `.preset-row` / `.preset-chip` (regex presets in popup) | `.preset-chips` / `.preset-chip` inside `.pattern-panel` | Now lives inside the collapsed-by-default `.disclosure-row`, not a permanently-open section — the "Extract by pattern" progressive-disclosure requirement. |
| `.muted` (generic secondary text) | Split by role: `.section-label` (uppercase eyebrow), `.armed-hint`/`.disclosure-hint` (inline hint), `.consequence` (settings only) | Stop using one undifferentiated `.muted` class — each has a distinct type-scale step (§2) and a verified-contrast color (`--on-surface-variant` everywhere, never a separate "faint" token — that faint token is exactly what failed AA in three of the four original concepts). |
| `.inline-error` / `.status.error` / `.status.success` | `.toast` / `.toast.is-error`, `.match-count.is-invalid` | The freestanding `<p className="status">` at the bottom of `App.tsx` becomes the persistent `#toastSlot` (`role="status" aria-live="polite"`, `role="alert" aria-live="assertive"` for errors) described in §4.7 — same live-region idea the current code already has via `role="status" aria-live="polite"` on its one `<p>`, just promoted to a real toast component with an icon, dismiss button, and (on success) an adjacent `.undo-pill` wired to `planUndo`/`loadUndo`/`clearUndo`. |
| *(no undo UI yet)* | `.undo-pill` | New. Rendered only when `loadUndo(windowId)` resolves a snapshot; clicking calls `planUndo` and clears it via `clearUndo`. |
| `COPY_FORMATS` button row | `.copy-row` / `.format-group` / `.format-chip` / `.copy-btn` | Same `ClipboardFormat` data, restyled as a segmented chip group + one icon copy button instead of N full-width buttons — "compact" per doctrine. |

### 7.3 `apps/extension/entrypoints/options/App.css` + `App.tsx`

`options/App.tsx`'s reducer/state shape (`prefs`, `draft`, `status`/`error`) maps onto the final design almost without restructuring — it's a restyle, not a rebuild:

| Current class | Final design equivalent | Notes |
|---|---|---|
| `.options-shell` | `.page` (max-width 640px, centered) | Matches doctrine's "centered ~640px column" exactly; current shell is 720px — narrow it. |
| `.panel` ×N (Sorting, Regex presets) | `.settings-section` ×5 (Sorting, **Tidy** new, Duplicates, Regex presets, **Keyboard shortcuts** new) | Two new sections needed: **Tidy** (`collapseAfterTidy`, `minGroupSize`, `groupOrder`, `regroupExisting` — all already on `Prefs` in `lib/types.ts`, just not surfaced in `App.tsx` yet) and a read-only **Keyboard shortcuts** reference section. |
| `<select>` (Default sort for background actions) | `.segmented` (`data-pref="defaultSort"`) | Same `SortMode` values (`"title"`/`"domain"`), rendered as a two-button segmented control per §4.2 instead of a native select. |
| `.checkbox-row` + native `<input type="checkbox">` | `.switch` (real checkbox + `.track`, §4.9) | Visually restyled only — the current code already uses a real `<input type="checkbox">`, so this is a pure CSS swap, no JSX semantics change. Every switch needs a `.consequence` sentence directly under its label (already present for the one existing checkbox; add for the new Tidy/Duplicates toggles). |
| `.preset-form` / `.preset-list` | `.preset-form` / `.preset-list` / `.preset-row` | Same shape; add the `.preset-dot` (cycles through the 5 non-warm `GroupColor` dots for visual scannability) and swap the plain "Delete" text button for the circular `.icon-btn` (trash glyph, `aria-label="Delete {label} preset"` already present in current code — keep it). |
| `.status.success` / `.status.error` (bottom of page) | `#saveIndicator` (top-right, quiet fade, §4.9) + inline `.form-error` under the preset form | Move save confirmation out of a page-bottom banner and into the quiet top-right "Saved." chip that live-saves on every field change; keep validation errors inline and specific (current `validatePreset` messages in `App.tsx` already do this — reuse verbatim, just restyle the container). |

No new preference needs to be invented for the Tidy section — every control in the final `settings.html` (`collapseAfterTidy`, `minGroupSize` [2–9 stepper], `groupOrder` [`"alpha"`/`"sizeDesc"`], `regroupExisting`) already exists as a typed field on `Prefs` in `apps/extension/lib/types.ts` with a `DEFAULT_PREFS` value — Settings UI is the only missing piece, not the data model.
