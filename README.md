# tab-sorter

A **Manifest V3 Chrome extension** that tames a cluttered window:

- **Sort** the current window's tabs — **A→Z by title** or **grouped by domain** (then title).
- **Extract** tabs matching a **domain** (clickable list) or a **regex/substring** into a **new window**.

Built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) → **WXT** addon (React template), TypeScript, and Vite.

> **Status:** design approved and scaffolded; feature implementation not yet started.
> See the design spec and handoff below before contributing.

## Documentation

- **Design spec:** [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md)
- **Handoff (current state + next steps):** [`docs/HANDOFF.md`](docs/HANDOFF.md)

## Getting started

```bash
npm install                 # install workspace dependencies

cd apps/extension
npm run dev                 # WXT dev server (HMR) on port 5555
npm run build               # production build → apps/extension/.output/chrome-mv3
```

Then load `apps/extension/.output/chrome-mv3` as an unpacked extension at `chrome://extensions`.

## Structure

```
tab-sorter/                 # npm workspaces monorepo
├── apps/extension/         # WXT + React MV3 extension
├── packages/config/        # shared TS config
└── docs/                   # design spec + handoff
```

## Scripts (root)

- `npm run dev` — start all workspaces in dev mode
- `npm run build` — build all workspaces
- `npm run check-types` — TypeScript type-check across workspaces
