# Migration spec — tab-sorter (Chrome MV3 extension)

Filled for the Tailwind/CSS → StyleX migration of `tab-sorter`.
Every convert / review agent reads this file first; it is the single place where this project's stack, conventions, and overrides live.

## 1. Stack

| Fact | Value |
|---|---|
| UI framework | React 19 (`react: ^19.2.4`, `react-dom: ^19.2.4`), JSX via React 19 JSX transform |
| StyleX call | `stylex.props()` — React JSX, returns `{ className?, style? }` |
| Class prop today | `className` on elements |
| Style-forwarding prop after migration | `sx?: StyleXStyles` (from `@stylexjs/stylex`), applied **last** in `stylex.props(..., sx)` |
| Bundler / meta-framework | WXT `^0.20.26` wrapping Vite 8 (`@wxt-dev/module-react ^1.1.5`) |
| StyleX wiring (from INTEGRATION.md) | Multi-build-tool row: **one plugin instance per build that renders UI**, attached through WXT's per-build hook. Package: `@stylexjs/unplugin/vite`, called via factory in `wxt.config.ts` via `hooks['vite:build:extendConfig']` (gated on `entrypoints.some(e => ['popup', 'options'].includes(e.type))`) and `hooks['vite:devServer:extendConfig']`. |
| Build that renders the UI | HTML entrypoint group (`popup`, `options`). Sibling build that stays byte-identical and StyleX-free: MV3 background service worker (`background.ts`) |
| Rendering | CSR only, no SSR/SSG. Chrome MV3 extension popup & options pages. |
| Browser floor | Pinned to `chrome120` (Chrome >= 120). `lightningcssOptions.targets: browserslistToTargets(browserslist('chrome >= 120'))`. |
| Styling origin | Design specification `docs/design/final/DESIGN-SPEC.md` implemented in `apps/extension/assets/tokens.css`, `entrypoints/popup/App.css`, `entrypoints/options/App.css`. |
| Dark mode | `media` (`prefers-color-scheme: dark`) — defined on `:root` and overridden under `@media (prefers-color-scheme: dark)`. Modeled in StyleX via `stylex.defineVars` with `{ default: ..., '@media (prefers-color-scheme: dark)': ... }`. |
| Component library | None (clean hand-crafted accessible components). |
| State attribute vocabulary | Standard HTML/ARIA attributes: `disabled`, `checked`, `aria-expanded`, `aria-selected`, `aria-live`. |
| Class-merge / variant helpers | None. Direct conditional style application in `stylex.props(...)`. |
| Icons / leaf components | Inline SVG icons (`IconSparkle`, `IconSort`, `IconDomain`, `IconGear`, `IconChevron`, `IconUndo`, `IconClose`, `IconWarning`, `IconCheckCircle`, `IconCheck`, `IconDownload`, `IconCopy`, `IconFilter`, `IconArrowRight`, `IconSearch`, `IconRefresh`) taking `sx?: StyleXStyles`. |

## 2. Gate (exact commands)

| Step | Command |
|---|---|
| format | `bun run format` (`oxfmt --write '**/*.ts' '**/*.tsx'`) / check: `bun run format:check` |
| lint | `bun run lint` (`oxlint -c .oxlintrc.json . && bun run lint:boundaries`) |
| typecheck | `bun run check-types` (`tsgo`) |
| unit tests | `cd packages/core && bunx vitest run` & `cd apps/extension && bunx vitest run` |
| build | `bun run build` (`wxt build`) |
| full gate | `bun run check-types && bun run lint && bun run build && (cd packages/core && bunx vitest run) && (cd apps/extension && bunx vitest run)` |

## 3. Global CSS that outranked utilities / component rules

Kept in `style.css` / `tokens.css`:
- Document root rules (`:root`, `html`, `body`, `#app` sizing and background)
- Base browser resets (`* { box-sizing: border-box; }`)
- Focus visible baseline outline (`:focus-visible`)
- Universal reduced-motion reset (`@media (prefers-reduced-motion: reduce)`)
- Custom scrollbar styling (`*::-webkit-scrollbar`)

## 4. Merge-helper conflict rules in force

None. StyleX handles property precedence natively: later arguments in `stylex.props(base, conditional, sx)` win deterministically.

## 5. Parent → child rules and markers

Any ancestor-scoped default icon sizing or hover triggers are handled with `stylex.defineMarker` and `stylex.when.ancestor(...)` or explicit `sx` styling.

## 6. Tokens

`apps/extension/assets/tokens.stylex.ts`:
Every token from `DESIGN-SPEC.md` / `tokens.css` preserved with 1:1 hex/hsl values across light and dark `@media` modes:
- Surfaces: `surface`, `surfaceContainerLowest`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest`
- Text: `onSurface`, `onSurfaceVariant`, `outline`, `outlineVariant`
- Accents: `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`
- Semantics: `error`, `onError`, `errorContainer`, `onErrorContainer`, `warningContainer`, `onWarningContainer`, `successContainer`, `onSuccessContainer`
- 9 Tab Group colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange` (dot, bg, fg)
- Typography: `fontSans`, `fontDisplay`, `fontMono`
- Radii: `radiusS` (10px), `radiusM` (14px), `radiusL` (20px)
- Shadows & timing: `elevation1`, `elevation3`, `ease`, `dur`, `heroKbdBg`, `heroKbdBorder`

## 7. Component API

All components and icon primitives accept optional `sx?: StyleXStyles`, passed as the last argument to `stylex.props(...)`.

## 8. Parity hosts and scenarios

- Host: `--serve .output/chrome-mv3` or `--cdp`
- Scenarios:
  - `popup__light`, `popup__dark`
  - `popup_armed__light`, `popup_armed__dark` (two-step dedupe confirm)
  - `popup_regex__light`, `popup_regex__dark` (regex extraction panel open)
  - `options__light`, `options__dark`
  - `options_saved__light`, `options_saved__dark` (save indicator active)

## 9. File groups

| Group | Files | Notes |
|---|---|---|
| A (Foundation) | `apps/extension/assets/tokens.stylex.ts`<br>`apps/extension/wxt.config.ts`<br>`apps/extension/package.json` | Infrastructure, tokens, Vite unplugin |
| B (Popup Views) | `apps/extension/entrypoints/popup/App.tsx`<br>`apps/extension/entrypoints/popup/App.css` | Popup layout, hero button, domain list, sort buttons, dedupe panel, regex extract, toast |
| C (Options Views) | `apps/extension/entrypoints/options/App.tsx`<br>`apps/extension/entrypoints/options/App.css` | Options settings page, segmented controls, toggle switches, steppers, select fields |
| D (Stylesheets & HTML) | `apps/extension/entrypoints/popup/style.css`<br>`apps/extension/entrypoints/options/style.css`<br>`apps/extension/entrypoints/popup/index.html`<br>`apps/extension/entrypoints/options/index.html` | Clean document-shell CSS and StyleX stylesheet link |
