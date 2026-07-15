# tab-sorter

A **Manifest V3 Chrome extension** that tames a cluttered window:

- **Sort** the current window's tabs — **A→Z by title** or **grouped by domain** (then title).
- **Extract** tabs matching a **domain** (clickable list) or a **regex/substring** into a **new window**.
- **Export** all tab URLs plus titles as **Markdown** or **plain text**.

Built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) → **WXT** addon (React template), TypeScript, and Vite. Tooling runs on **Bun** with the native TypeScript compiler preview (**tsgo**), **oxc** (oxlint + oxfmt), and **react-doctor**.

## Documentation

- **Design spec:** [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md)
- **Handoff (current state + next steps):** [`docs/HANDOFF.md`](docs/HANDOFF.md)

## Getting started

```bash
bun install                 # install workspace dependencies

cd apps/extension
bun run dev                 # WXT dev server (HMR) on port 5555
bun run build               # production build → apps/extension/.output/chrome-mv3
```

Then load `apps/extension/.output/chrome-mv3` as an unpacked extension at `chrome://extensions`.

## Structure

```
tab-sorter/                 # Bun workspaces monorepo
├── apps/extension/         # WXT + React MV3 extension
├── packages/config/        # shared TS config
└── docs/                   # design spec + handoff
```

## Scripts (root)

- `bun run dev` — start all workspaces in dev mode
- `bun run build` — build all workspaces
- `bun run check-types` — TypeScript type-check across workspaces (tsgo)
- `bun run test` — run Vitest across workspaces
- `bun run lint` — run oxlint across workspaces
- `bun run format` — format with oxfmt
- `bun run format:check` — check formatting
- `bun run check:doctor` — run react-doctor health check

## Tech notes

- `packageManager` is pinned to `bun@1.3.14` (the latest stable Bun release; CI installs the same version via `oven-sh/setup-bun`).
- Type checking uses `@rslint/tsgo` (the native/Go TypeScript preview). The `typescript` package is kept for declaration files and editor support.
- Linting uses `oxlint` with the React, TypeScript, Unicorn, and Import plugins.
- Formatting uses `oxfmt`.
- Tests use **Vitest** + `@webext-core/fake-browser` + `@testing-library/react`.
