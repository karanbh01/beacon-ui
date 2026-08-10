# beacon-ui

Electron frontend for [`py-beacon`](https://github.com/karanbh01/py-beacon).

## Requirements

- Node 20+
- pnpm 9
- Python 3.11+ **and a `py-beacon` checkout beside this one** — see
  [The engine](#the-engine). Without it the app builds and runs, and every
  view sits empty because there is nothing to serve it.

## Getting started

```bash
pnpm install
pnpm dev        # opens the app with hot reload in renderer and main
```

## The engine

beacon-ui does not contain py-beacon and does not install it. In development
it **spawns** it, so a clone of this repo on its own gets you an app that
starts and then reports `engine stopped` in the footer.

Clone py-beacon as a **sibling** of this repo and give it a virtualenv:

```bash
cd ..                                       # alongside beacon_ui, not inside it
git clone https://github.com/karanbh01/py-beacon.git
cd py-beacon
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[server]"   # Windows
# .venv/bin/python -m pip install -e ".[server]"     # macOS / Linux
```

The `[server]` extra is not optional. `beacon.server` imports fastapi,
uvicorn, scipy and reportlab at module scope, so a plain `pip install -e .`
produces an interpreter that fails at import rather than one that starts
without the extras.

### Which interpreter it picks

`src/main/engine/python.ts`, most specific first:

1. `$BEACON_PYTHON`
2. `../py-beacon/.venv/` — the sibling checkout
3. `../py_beacon/.venv/`
4. `./.venv/` — inside this repo
5. `python` on `PATH`

A packaged build inserts its own bundled runtime above all but
`$BEACON_PYTHON`, so a shipped app never depends on what is on the user's
`PATH` (ADR-0003).

Falling through to `PATH` is what a machine with no py-beacon checkout does,
and it is the usual cause of a dead engine: that interpreter has no `beacon`
module, so `python -m beacon.server` exits with `ModuleNotFoundError` before
it can announce a port.

### When it will not connect

The footer states what the python supervisor is actually doing, and hovering
it shows the reason. `engine unavailable · reconnecting` is a restart in
flight; `engine stopped` means the supervisor gave up. The server's own stderr
goes to the terminal running `pnpm dev`, which is where the import error will
be spelled out.

### Environment

| Variable              | Effect                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `BEACON_PYTHON`       | Pin an interpreter. Beats every other candidate, including a packaged bundle.       |
| `BEACON_SERVER_URL`   | Attach to a py-beacon you are running yourself; never spawn one.                    |
| `BEACON_DATA_PATH`    | Read by py-beacon. Set means you have named a data source, so nothing is generated. |
| `BEACON_NO_SYNTHETIC` | Never generate the first-run synthetic store.                                       |

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
| `pnpm e2e`           | Playwright against the real Electron app             |
| `pnpm storybook`     | Component workbench on :6006                         |
| `pnpm pack:dry`      | electron-builder unpacked, no publish                |

`pnpm e2e` builds first and runs against a py-beacon-shaped stub server, so it
needs no python and no checkout.

### Generated artefacts

Tokens, icons, fonts, the app icon and the typed API client are all generated
and **committed**, so the app builds without a codegen step. Each has a
`:build` script and a matching `:check` that regenerates and fails on a diff —
`tokens`, `icons`, `fonts`, `icon`, `api`. CI runs every `:check`, so an
artefact edited by hand or left stale is a build failure rather than a
surprise later.

`pnpm spec:refresh` re-exports `openapi.json` from the sibling py-beacon
checkout and regenerates the client from it.

CI runs the drift checks, format check, lint, typecheck, tests and the E2E
suite on every push to `main` and every PR; the packaging dry-run runs on
`main` only.

## Layout

```
src/main       window, python lifecycle, menus  (Node)
src/preload    typed IPC bridge                 (isolated)
src/renderer   React app                        (Chromium)
src/shared     IPC contract types               (both sides)
src/test       vitest setup and shared helpers
e2e            Playwright specs and the stub engine
scripts        codegen for tokens, icons, fonts, the app icon
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
