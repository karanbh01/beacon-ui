# beacon-ui

Electron frontend for [`py-beacon`](https://github.com/karanbh01/py-beacon).

## Requirements

- Node 20+
- pnpm 9

## Getting started

```bash
pnpm install
pnpm dev        # opens the app with hot reload in renderer and main
```

## Scripts

| Script               | Does                                                 |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Dev build + Electron, hot reload (renderer and main) |
| `pnpm build`         | Production build into `out/`                         |
| `pnpm start`         | Preview the production build                         |
| `pnpm typecheck`     | Typecheck the node and web projects                  |
| `pnpm lint`          | eslint, type-aware strict rules                      |
| `pnpm format`        | prettier, write in place                             |
| `pnpm test`          | vitest, single run                                   |
| `pnpm test:watch`    | vitest, watch mode                                   |
| `pnpm test:coverage` | vitest with v8 coverage                              |
| `pnpm pack:dry`      | electron-builder unpacked, no publish                |

CI runs format check, lint, typecheck and tests on every push to `main` and
every PR; the packaging dry-run runs on `main` only.

## Layout

```
src/main       window, python lifecycle, menus  (Node)
src/preload    typed IPC bridge                 (isolated)
src/renderer   React app                        (Chromium)
src/shared     IPC contract types               (both sides)
docs/adr       architecture decision records
```

Renderer path aliases: `@/components`, `@/views`, `@/api`, `@/state`,
`@/tokens`. `@shared` resolves to `src/shared` from all three targets.

## Design spec

- Figma `beacon ui` — file key `0GMEqKcFlQRBUgSpTpjAYN`
- `beacon_tab_taxonomy_v3.md` — tab and view taxonomy, design-system source of
  truth. Kept locally at the repo root and **gitignored** by choice; ask the
  owner for a copy.

## Issues

Work is tracked as `BU-n` issues against milestones M0–M5. Issue numbers match
BU numbers (`BU-7` is issue #7).
