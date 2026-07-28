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

| Script           | Does                                    |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Dev build + Electron, hot reload         |
| `pnpm build`     | Production build into `out/`             |
| `pnpm start`     | Preview the production build             |
| `pnpm typecheck` | Typecheck the node and web projects      |

Lint, format and test scripts arrive with CI in BU-2.

## Layout

```
src/main       window, python lifecycle, menus  (Node)
src/preload    typed IPC bridge                 (isolated)
src/renderer   React app                        (Chromium)
src/shared     IPC contract types               (both sides)
docs/adr       architecture decision records
planning       issue batches and specs
```

Renderer path aliases: `@/components`, `@/views`, `@/api`, `@/state`,
`@/tokens`. `@shared` resolves to `src/shared` from all three targets.

## Design spec

- Figma `beacon ui` — file key `0GMEqKcFlQRBUgSpTpjAYN`
- `beacon_tab_taxonomy_v3.md` (repo root) — tab and view taxonomy

## Issues

Work is tracked as `BU-n` issues against milestones M0–M5. The originating
batch is in `planning/`.
