# beacon-ui — Issue batch BU-1 → BU-30

**Instructions for Claude Code:** create the repo if needed, then the issues, with the `gh` CLI (run locally — Claude.ai's container blocks `api.github.com`).

```bash
gh repo create karanbh01/beacon-ui --private --description "Beacon — Electron frontend for py-beacon" || true
for l in scaffold tokens components shell bridge views charts packaging quality deferred; do
  gh label create "$l" --repo karanbh01/beacon-ui --force; done
gh issue create --repo karanbh01/beacon-ui --assignee karanbh01 \
  --title "[BU-1] ..." --label scaffold --body "..."
```

Milestones (create first, attach via `--milestone`): `M0 Shell`, `M1 First light`, `M2 Explorer`, `M3 Strategy loop`, `M4 Analytics`, `M5 Ship`.
Spec references: Figma `beacon ui` (key `0GMEqKcFlQRBUgSpTpjAYN`) and `beacon_tab_taxonomy_v3.md` (commit it to the repo root in BU-1).

---

## [BU-1] Scaffold electron-vite + React + TypeScript strict
Labels: `scaffold` · Milestone: M0

**Tasks**
- [ ] electron-vite scaffold, React 18, TS strict; targets `main` / `preload` / `renderer`
- [ ] Folder shape: `src/main` (window, python lifecycle, menus), `src/preload` (typed IPC bridge), `src/renderer`, `src/shared` (IPC contract types); tsconfig paths `@/components @/views @/api @/state @/tokens`
- [ ] Commit `beacon_tab_taxonomy_v3.md` to repo root as the design spec
- [ ] ADR-0001: Electron over Tauri (Chromium consistency for dense tables/charts; Node main for python process management); note revisit criteria
**Acceptance.** `pnpm dev` opens a window with hot reload in renderer and main.

## [BU-2] Tooling and CI
Labels: `scaffold` · Milestone: M0

**Tasks**
- [ ] eslint (typescript-eslint strict) + prettier + vitest; scripts `lint typecheck test`
- [ ] CI: lint + typecheck + unit tests on PR; electron-builder dry-run on main; pnpm cache
**Acceptance.** PR pipeline green on the scaffold.
Depends on: BU-1

## [BU-3] Window defaults
Labels: `scaffold` · Milestone: M0

**Tasks**
- [ ] 1440×1024 default, 1280×900 min, standard frame (custom chrome = deferred issue); position/size persistence
**Acceptance.** Relaunch restores geometry.
Depends on: BU-1

---

## [BU-4] Token pipeline: Figma variables → CSS custom properties
Labels: `tokens` · Milestone: M0

**Tasks**
- [ ] `tokens/colors.json` exported from Figma variables, both modes (canvas, surface, border, divider, text-primary/secondary/muted, accent, success, danger, sidebar-active-bg, chrome-border, chrome-search-bg, chrome-search-stroke)
- [ ] Build script → CSS vars on `:root[data-theme]` + `tokens.ts` literals for chart code
- [ ] Add `series-2`, `series-3` (new tokens — compare lines stop borrowing success/danger); mirror back into Figma
**Acceptance.** Swapping `data-theme` restyles a demo page with no component changes.
Depends on: BU-1

## [BU-5] Theme switching
Labels: `tokens` · Milestone: M0

**Tasks**
- [ ] Light/dark/follow-OS, persisted; screenshot parity check against the Figma dark frames for one view
**Acceptance.** Toggle is instant; no unthemed flashes.
Depends on: BU-4

## [BU-6] Type scale and icon set
Labels: `tokens` · Milestone: M0

**Tasks**
- [ ] Text utilities: 16 Medium, 13 Medium, 11 body, 10 Medium letterspaced, 9 Medium 6%
- [ ] Icons as `currentColor` React components: chevron (10px), chain glyph, drag `⠿`, sidebar glyphs, β mark
**Acceptance.** Storybook page shows the scale + icons in both themes.
Depends on: BU-4

---

## [BU-7] Primitives: Button, Field, FieldRow
Labels: `components` · Milestone: M0

**Tasks**
- [ ] `Button` default | accent-outline, optional chevron
- [ ] `Field` (label-above; headers/filters) and `FieldRow` (pricer grammar: fixed label rail + fixed-width box, flush-left singles, read-only variant = canvas fill + divider border + secondary text)
- [ ] Stories light+dark per state
**Acceptance.** Matches Figma atoms `388:146/147` and taxonomy §8.
Depends on: BU-6

## [BU-8] Primitives: Stat and SummaryLine
Labels: `components` · Milestone: M0

**Tasks**
- [ ] `Stat` (10px letterspaced label / 16px value) and `SummaryLine` (11px label/value pairs, divider-dot separators)
**Acceptance.** Reproduce the Weights summary line and Backtest strip from mock data.
Depends on: BU-6

## [BU-9] Primitive: TickerField
Labels: `components` · Milestone: M0

**Tasks**
- [ ] Subject display, linked state (chain + "linked to X · type to break ⏎"), Enter-to-query event, focus styles
**Acceptance.** Typing in linked state emits a sever event (consumed by BU-16).
Depends on: BU-6

## [BU-10] Primitive: PaneHeader
Labels: `components` · Milestone: M0

**Tasks**
- [ ] Kinds query | document | fields; controls as real children; document kind carries title/meta/dirty status slot
**Acceptance.** The four demo-strip configs (Prices, Charting-linked, TECH10, Risk Model) reproduce from props.
Depends on: BU-7, BU-9

## [BU-11] Primitives: Tab and TabBar
Labels: `components` · Milestone: M0

**Tasks**
- [ ] Full chip grammar (document/dirty/pinned/global/query/linked), active underline, `+`, close affordance
- [ ] Overflow behaviour decided + implemented (scroll vs collapse) — record in the issue
**Acceptance.** All six archetypes render pixel-true against the Figma demo bar.
Depends on: BU-6

## [BU-12] Primitive: Table
Labels: `components` · Milestone: M0

**Tasks**
- [ ] Hug-width card table: zebra via canvas, 10px thead + divider, right-aligned numerics, signed colouring, selection wash, total rows, 4px scrollbar; virtualisation hook point (`@tanstack/react-virtual`) for >200 rows
**Acceptance.** Weights table reproduces from mock data; 10k-row scroll stays smooth.
Depends on: BU-6

## [BU-13] Primitives: Card, Badge, AddSlot, SegmentedControl, Checkbox, KV
Labels: `components` · Milestone: M0

**Acceptance.** Constraint Set and Key Facts panes are composable from these + Table.
Depends on: BU-6

## [BU-14] Primitive: PaperPreview
Labels: `components` · Milestone: M0

**Tasks**
- [ ] Fixed-ratio 540×764 page, raw-ink content area (theme-independent), drop shadow, page furniture helpers (running header/footer rules, page n of m)
**Acceptance.** Static factsheet mock renders identically in both themes.
Depends on: BU-6

---

## [BU-15] App shell chrome: menu bar, sidebar, footer
Labels: `shell` · Milestone: M0

**Tasks**
- [ ] Menu bar (HTML menus initially) + search field + right icon cluster; sidebar with 6 page icons + Guides, active wash; footer with engine/data/version slots (stubbed)
**Acceptance.** Shell matches the Figma frame geometry (62/58/32) in both themes.
Depends on: BU-6, BU-11

## [BU-16] Tab/workspace state machine
Labels: `shell` · Milestone: M0

**Context.** The heart of the app. Spec from taxonomy §1–2 before coding.

**Tasks**
- [ ] Zustand store: tabs `{viewKind, archetype, subject?, pinnedDoc?, linkSource?, dirty}` per page; persistence
- [ ] Semantics: linked tabs re-render on source-subject change; typing severs (chain drops, becomes independent query view); pinned views immutable without re-pin; dirty lifecycle
- [ ] Unit tests for every transition **before** views consume it
**Acceptance.** Test suite covers link/sever/pin/dirty/close/reopen; a two-tab demo shows live link-follow and sever.
Depends on: BU-11

## [BU-17] Pane host and routing
Labels: `shell` · Milestone: M0

**Tasks**
- [ ] Pane at (58, 62) with 20/24 padding; view registry mapping viewKind → component; per-page tab persistence
**Acceptance.** Switching pages restores that page's tabs and active view.
Depends on: BU-15, BU-16

## [BU-18] AI Assistant panel (static)
Labels: `shell` · Milestone: M0

**Tasks**
- [ ] Collapsible 380px right rail; message / tool-call / sub-agent block components; static transcript from the mock; pane narrows to 1002 when open
**Acceptance.** Open/close reflows the pane; no live wiring yet (deferred issue when backend support exists).
Depends on: BU-15

---

## [BU-19] Python process lifecycle (spawn, health, restart)
Labels: `bridge` · Milestone: M1

**Tasks**
- [ ] Main process locates python env, spawns `python -m py_beacon.server --port 0`, parses port from stdout, passes bearer token, health-polls, restart-with-backoff, kills on quit
- [ ] Dev mode: `BEACON_SERVER_URL` connects to an externally-run server
- [ ] Footer wired truthfully: `engine connected · py-beacon x.y.z` / degraded state
**Acceptance.** Kill -9 the child → footer degrades → auto-restart → recovers, within 5s.
Depends on: BU-15; py-beacon BN-63

## [BU-20] Generated API client
Labels: `bridge` · Milestone: M1

**Tasks**
- [ ] `openapi-typescript` generation from py-beacon's `openapi.json` CI artifact; thin fetch wrapper injecting token + error-envelope mapping; CI job fails on spec drift
**Acceptance.** `client.data.prices("AAPL", …)` is fully typed end-to-end.
Depends on: BU-19; py-beacon BN-76 (artifact)

## [BU-21] Server state: TanStack Query + WS events
Labels: `bridge` · Milestone: M1

**Tasks**
- [ ] Query setup with per-subject/asof cache keys; WS hook for job progress + freshness; job-to-toast/inline-progress mapping; footer `data updated · Nh ago`
**Acceptance.** A stub long job streams progress into a progress affordance and settles the query cache.
Depends on: BU-20; py-beacon BN-69

---

## [BU-22] Data Explorer: Prices (first live view)
Labels: `views` · Milestone: M1

**Tasks**
- [ ] Query header (TickerField + meta), summary strip, range/custom dates, OHLCV table with scroll; live from `/data/prices`
**Acceptance.** Matches the Figma frame both themes with live AAPL data; M1 exit criterion.
Depends on: BU-10, BU-12, BU-21; py-beacon BN-65

## [BU-23] Data Explorer: Reference Data, Corporate Actions, Fundamentals
Labels: `views` · Milestone: M2
Depends on: BU-22; py-beacon BN-65

## [BU-24] Data Explorer: Watchlist and Data Coverage
Labels: `views` · Milestone: M2
**Note.** Watchlist row click opens Prices for that symbol (cross-view interaction); Coverage sync uses the job flow.
Depends on: BU-22; py-beacon BN-66

## [BU-25] Data Explorer: Charting (linked-tab mechanics)
Labels: `views` · Milestone: M2
**Tasks**
- [ ] Linked query header, range/interval/compare chips, rebased multi-series chart + volume; link-follow and sever proven live against another tab
**Acceptance.** Changing the Prices tab's subject re-renders Charting; typing in Charting severs.
Depends on: BU-16, BU-22, BU-28

## [BU-26] Strategy Builder: Universe Set and Index Definition
Labels: `views` · Milestone: M3
**Tasks**
- [ ] Universe flat catalogue; Index Definition with grouped pipeline (Selection / Weighting & Caps / Treatment), per-section add slots, selection-wash + inline rule accordion, validation card, dirty/save lifecycle on the document tab
Depends on: BU-13, BU-16; py-beacon BN-67

## [BU-27] Strategy Builder: Constituent Preview + Backtest flow
Labels: `views` · Milestone: M3
**Tasks**
- [ ] Derivation waterfall (per-rule columns, greyed exclusions); Beacon View Backtest pane driven by the job flow (progress → chart + drawdown + annual table)
**Acceptance.** Define → preview → backtest works end-to-end on a fresh index; M3 exit criterion.
Depends on: BU-26, BU-21, BU-28; py-beacon BN-68, BN-70

## [BU-28] Chart foundation
Labels: `charts` · Milestone: M2
**Tasks**
- [ ] 1-day spike: lightweight-charts (price/level) + visx/d3 (frontier, diverging bars, heatmap, term structure, drawdown subpanel) — confirm or revise, record ADR
- [ ] Token-driven chart theme; shared axis/gridline/last-value conventions; rebase-to-100 transform
**Acceptance.** Level chart + drawdown subpanel render from backtest data in both themes.
Depends on: BU-4

## [BU-29] Beacon View: Overview, Weights, Attribution, Drilldown, Comparison
Labels: `views` · Milestone: M4
**Note.** Drilldown is the second linked view; Attribution must refuse (dev-mode warn) non-reconciling data.
Depends on: BU-27; py-beacon BN-71

## [BU-30] Optimiser views (Constraint Set, Run, Frontier, Risk Model, Exposures)
Labels: `views` · Milestone: M4
**Note.** Risk Model heatmap uses the sanctioned raw-RGB colormap; frontier from BU-28's d3 layer.
Depends on: BU-28; py-beacon BN-72, BN-73

## [BU-31] Derivatives pricers + curve views
Labels: `views` · Milestone: M4
**Tasks**
- [ ] Futures + TRS as FieldRow forms with live reprice on input (debounced POST); Term Structure + Roll views
**Acceptance.** Editing spot immediately moves the carry decomposition; values match `S·e^((r−q)T)`.
Depends on: BU-7, BU-28; py-beacon BN-74

## [BU-32] Reports views + Template Editor
Labels: `views` · Milestone: M5
**Tasks**
- [ ] Sections checklist + PaperPreview factsheet; page-nav pattern for Performance/Attribution; Template Editor block list with inline block editor and dirty/save; render via job → open PDF externally
Depends on: BU-14, BU-21; py-beacon BN-75

---

## [BU-33] Packaging: electron-builder + bundled python
Labels: `packaging` · Milestone: M5
**Tasks**
- [ ] dmg (arm64/x64) + nsis; β icon
- [ ] ADR + spike: bundle python-build-standalone + wheels (biased default) vs system python vs PyInstaller; implement the choice
**Acceptance.** Clean machine installs and reaches "engine connected" with zero manual setup.
Depends on: BU-19

## [BU-34] Auto-update + release CI
Labels: `packaging` · Milestone: M5
**Tasks**
- [ ] electron-updater via GitHub Releases; footer `update available` wired for real; tag → multi-platform build → draft release; code-signing/notarisation filed as follow-up before external sharing
Depends on: BU-33

## [BU-35] E2E and quality gates
Labels: `quality` · Milestone: M5
**Tasks**
- [ ] Playwright against a stub server: one flow per page; tolerance-based screenshot diff vs Figma exports for key frames
- [ ] Unit: number formatting (signed, %, $M/k); reconciliation renderers warn in dev on non-reconciling data
- [ ] Perf: virtualised table budget; heatmap frame < 16ms
Depends on: BU-22…BU-32 incrementally; start after BU-22
