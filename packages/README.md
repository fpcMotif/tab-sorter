# packages/

Each `packages/<name>/` is a deep module: a small public surface hiding real behaviour. Root files in a package (`index.ts`, `client.ts`, …) are its **entry points**. Everything in a subfolder — by convention `lib/` for implementation, `tests/` for tests — is **private**.

## The rule

Import only through a package's entry points (its root files). Anything in any subfolder is private, from every caller: app code, root scripts, and other packages alike. Within a single package, files are free to import each other however they like.

## Tests go through entry points too

A package's own `tests/` import from its entry points (`../index`, `../client`, …), never from `lib/` directly. Tests are exercised the same way any other consumer would use the package, and `tests/` fixtures are private to that package's own tests.

## No cycles

No dependency cycles anywhere in `apps/` or `packages/`.

## Checking it

Run `bun run lint:boundaries` to enforce entry-point and cycle rules via dependency-cruiser (config: `.dependency-cruiser.cjs`). It's part of the root `lint` script, so `bun run lint` runs it too.

## Avoid barrel files

Don't re-export a whole subtree through one `index.ts` that just forwards everything from `lib/`. Barrels erase the entry-point boundary they're meant to enforce and make it too easy to import something that should stay private. Prefer several small, purposeful entry points — `index.ts`, `client.ts`, `server.ts`, … — each importing only what it needs from `lib/` directly.

## First real package: @tab-sorter/core

`packages/core` is the first real package under this regime — the chrome-free planning layer: the TabLite/TabPlan vocabulary and the planners that operate on it (sort, tidy, dedupe, undo, and friends), each behind its own entry point (`./types`, `./plan`, `./tidy`, …) rather than one barrel. Raw browser tab shapes never enter it; callers convert to `TabLite` before crossing in.

## Copy-me template

`packages/example/` is a template to copy for a new package:

```
packages/example/
├── package.json      # { "name": "@tab-sorter/example", ... } — no "scripts" key
├── index.ts           # entry point, delegates to lib/impl
├── lib/
│   └── impl.ts        # implementation, private
└── tests/
    └── example.test.ts  # imports only from ../index
```
