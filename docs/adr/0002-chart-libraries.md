# ADR-0002: lightweight-charts for price-like charts, visx/d3 for the rest

- **Status:** Accepted
- **Date:** 2026-08-01
- **Issue:** BU-28

## Context

beacon-ui needs two genuinely different kinds of chart, and BU-28 exists to
decide whether one library can serve both.

**Price-like.** A time axis, one to three series, pan and zoom, a crosshair
that reports values as it moves, a last-value label on the axis, and a second
pane sharing the time scale for volume or drawdown. Charting (BU-25), the
Backtest pane (BU-27) and Beacon View's level chart (BU-29) are all this
shape. Series can be long — daily bars back to 1962 is roughly 16,000 points
per instrument, and the coverage pane reports py-beacon holds exactly that.

**Bespoke.** An efficient frontier scatter with a highlighted point, diverging
attribution bars, a correlation heatmap, a futures term structure, an annual
returns bar row. Each appears once, none needs pan or zoom, and every one has
a layout that no charting library ships.

## Decision

Use **lightweight-charts** (v5) for price-like charts and **visx/d3** for the
bespoke ones. This confirms the split BU-28 proposed rather than revising it.

The deciding factor is not what each library can draw — visx can draw a line —
but what it would cost to *not* use lightweight-charts for the price-like
charts. Pan, zoom, a snapping crosshair, axis-edge value labels, month-level
time-axis tick selection and synchronised panes are hard, and beacon-ui gets
no credit for reimplementing them. `lightweight-charts` is ~45 KB gzipped and
supplies all of it.

It is equally clear that lightweight-charts should **not** be pushed into the
bespoke charts. It has no scatter, no heatmap, no categorical axis, and its
custom-series API buys nothing when there is no time axis to share.

Two facts from the spike settled the details:

- **v5's native panes (`addSeries(..., paneIndex)`) are what make the drawdown
  subpanel viable.** Before v5 a subpanel meant a second chart with its time
  scales manually kept in sync, which drifts the moment either is panned. The
  Figma frame (289:2846) draws the volume panel *inside* the plot area, and
  panes are how that is built rather than approximated.
- **The theme has to be pushed in, not inherited.** A canvas cannot read CSS
  custom properties. `scripts/build-tokens.mjs` already emits resolved literals
  in `tokens.ts` alongside `tokens.css`, so `charts/theme.ts` reads
  `COLORS[mode]` — one generator, two outputs, no way for a chart to drift
  from the surface around it.

## Alternatives considered

**visx/d3 for everything.** Consistent, tree-shakeable, and SVG means themes
work through `currentColor` with no theme plumbing at all. Rejected on two
counts: reimplementing interaction is weeks of work with a poor failure mode
(a crosshair that is subtly wrong is worse than none), and SVG puts one node
per point — a 16,000-point series is a 16,000-node DOM, which is the same
problem BU-11 solved for tables with virtualisation and cannot solve here.

**lightweight-charts for everything.** Rejected: no scatter, no heatmap, no
categorical axis. Every bespoke chart would become a custom series renderer,
which is writing the drawing code anyway while inheriting a time axis it does
not want.

**Recharts / Chart.js.** Rejected: both are general-purpose, and neither does
the financial conventions (axis-edge last value, synchronised panes, month
ticks) without fighting. Chart.js also owns its own canvas lifecycle in ways
that conflict with React strict-mode double-mounting.

## Consequences

- **Two chart libraries in the bundle.** Accepted; they serve disjoint sets of
  charts, and visx is imported per-package so only what is used ships.
- **Charts cannot be asserted in jsdom.** lightweight-charts needs a real 2D
  canvas context, which jsdom does not provide. Everything decidable without
  pixels — the transforms (`rebase100`, `drawdown`, `toTime`) and the theme
  mapping — is unit-tested; the rendered result is checked in Storybook and in
  the running app. Adding `node-canvas` to make the component testable was
  considered and rejected: it would test a different renderer than ships.
- **The series palette is three colours** (`accent`, `series-2`, `series-3`) —
  all the design approves. A fourth compared asset wraps rather than inventing
  one.
- **Charts must be created once and mutated**, never recreated per render, or
  a theme switch or a data update silently resets the user's pan and zoom.

## Revisit if

- A view needs more than three simultaneous series, forcing a palette decision
  the tokens do not cover.
- lightweight-charts' licence or maintenance changes (currently Apache-2.0,
  maintained by TradingView).
- The bespoke charts turn out to need interaction on the level of the
  price-like ones, at which point one library for both is worth re-examining.
