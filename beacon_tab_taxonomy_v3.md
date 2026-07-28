# Beacon — Tab Taxonomy & UI Patterns (v3)

Design-system source of truth for the Beacon UI (py-beacon frontend).
Supersedes v2. Figma: `beacon ui` → Components page (Tab set `118:6`, atoms + `Pane Header` set `388:11538`, demo strips `tab-archetypes-demo`, `pane-header-demo`).

**Scope of v3:** the full application is now mocked — Data Explorer (7 views), Strategy Builder (3), Optimiser (5), Beacon View (6 + AI Assistant), Derivatives (4), Reports (4) — in light and dark. v3 folds in every pattern decided while building them.

---

## 1. Tab archetypes

| #   | Archetype         | Example               | Chip                 | Notes                                     |
| --- | ----------------- | --------------------- | -------------------- | ----------------------------------------- |
| 1   | Document (active) | `TECH10`              | none                 | Mutable working object; owns dirty state  |
| 2   | Document (dirty)  | `FACTSHEET-A4 ●`      | none                 | Dot = unsaved changes                     |
| 3   | Pinned view       | `Frontier [⛓ TECH10]` | chain chip           | Bound to a document; re-pin to change     |
| 4   | Global tool       | `Data Coverage`       | none                 | Not about any subject; filter-header pane |
| 5   | Query view        | `Prices [AAPL]`       | subject chip         | Subject mutable via pane query bar        |
| 6   | Linked query view | `Drilldown [⛓ AAPL]`  | subject chip + chain | Subject follows another tab's subject     |

Real usage across the app:

- **Documents:** `TECH10` (index definition), `TECH10-OPT` (optimisation run), `FACTSHEET-A4` (template, dirty).
- **Pinned views:** all Beacon View tabs, Frontier, Risk-model-adjacent views, all Derivatives, all Reports previews, `Exposures [⛓ TECH10-OPT]` (a view can pin to _any_ document, not just an index).
- **Query / linked query:** Data Explorer instrument views; `Charting [⛓ AAPL]`, `Drilldown [⛓ AAPL]`.
- **Global tools:** Data Coverage, Watchlist, Universe Set, Constraint Set, Comparison, Risk Model.

## 2. Chip grammar (unchanged from v2)

- **Chip = a bound object.** 0.5px `chrome-border` stroke, 6/2 padding, 3px radius. No dots inside chips.
- **Chain glyph = "this value follows something else."** Pinned → follows a document (no query bar in pane). Linked → follows another tab's live subject.
- **Chainless chip = mutable subject** via the pane query bar.
- **Typing severs links** where typing is allowed; pinned views can't be broken by typing because their panes expose no query bar.

## 3. Tab component (Figma)

Set `118:6`; variants `Active=true 118:2 / false 118:4`.
Props: `Active` (variant), `Dirty#229:3`, `Pinned#229:0` (→ link-chip), `Query#242:0` (→ query-chip), `Linked#279:0` (chain inside query-chip).
Layers: label text is still named `Prices` (rename pending), subject `subject`, pin target `target`, chain `link-glyph`.

## 4. Component library (new in v3)

Atoms on the Components page, all fully variable-bound:

| Component    | ID              | Props                                                                                     |
| ------------ | --------------- | ----------------------------------------------------------------------------------------- |
| Button       | set `388:146`   | `Style=Default\|Accent`, `Chevron`, `Label`                                               |
| Field        | `388:147`       | `Chevron`, `Label`, `Value` (label-above-box; see §8 for the pricer's label-left pattern) |
| Stat         | `388:153`       | `Label`, `Value`                                                                          |
| Ticker Field | `388:11440`     | `Linked`, `Subject`, `Hint`                                                               |
| Pane Header  | set `388:11538` | `Kind=Query\|Document\|Fields`, `Action 1–4`, `Field 1–4`, `Meta`                         |

- **Query kind covers linked headers too** — `Linked` is a property of the nested Ticker Field, not a header variant.
- Controls cluster = four pre-provisioned Button slots (Figma instances can't gain children).
- Demo strip `pane-header-demo` shows four real configs (Prices, Charting-linked, TECH10 document, Risk Model fields).
- **Status:** components are the spec; the ~25 existing hand-built pane headers were deliberately _not_ retrofitted (mechanical, regression-prone). Retrofit or use as implementation reference — decide at build time.

## 5. Selection & state washes

- **Selection = full-row `sidebar-active-bg` wash.** Never chip-level accent, never border highlight. Used for: selected methodology rule, selected template block, front futures contract, quoted-spread row, accruing TRS period, selected sensitivity tenor.
- Inline editors (rule accordion, block editor) expand _under_ the selected row on `canvas` fill with the same left inset.
- **Affirmative buttons = accent outline** (transparent fill, accent stroke + text): Save, Apply, Run, Price, Re-run, Re-estimate, Revalue, Simulate roll, Export PDF. Neutral buttons: surface fill + border.

## 6. Strategy patterns

- **Universe is not a rule.** Index Definition separates INDEX DETAILS (incl. rebalancing as a plain form field) → UNIVERSE → methodology card.
- **Methodology card groups rules** into SELECTION / WEIGHTING & CAPS / TREATMENT, each with its own dashed `+ Add rule…` slot; rule rows are badge-rows (`CapRule` etc.) numbered `01…`.
- **Universe Set is a flat catalogue** (membership listing), not a funnel.
- **Constituent Preview is the funnel**: a column-per-rule derivation waterfall — columns `01–06` mirror rule numbers; excluded rows grey out at the failing column and show faint `·` beyond.

## 7. Summary-line vs stat-strip policy (new in v3)

Three tiers, chosen per view:

1. **Stat strip** (10px Medium muted label / 16px Medium value, 40–48px gaps) — only where a headline number _is_ the view's point. Retained on exactly: Prices, Fundamentals, Data Coverage, Frontier, Factor Exposures, Index Overview, Backtest, Roll Analysis.
2. **Summary line** — one 11px line where the strip sat: `label (muted, Regular) value (primary, Medium)` pairs separated by `·` in `divider` colour. Used on: Corporate Actions, Watchlist, Constituent Preview, Optimisation Run, Risk Model, Weights, Drilldown.
3. **Nothing** — when the table already carries every number (Attribution, both pricers). Duplicating in a smaller font is still duplication; orphan numbers get relocated into a card instead (e.g. TRS spread-cost & DV01 rows appended to the breakeven card).

## 8. Pricer form pattern (new in v3, final after three iterations)

Derivatives pricers are **calculators, not blotters**: no listed contracts, no booked trades ("theoretical, no listed contract" / "indicative, no trade booked" in the header meta; Reset inputs / Export / accent **Price** as controls).

Form grammar:

- Two-column input panel (660px) left, results cards right.
- Field = 11px muted label in a **fixed left rail** (118px futures / 122px TRS) + **fixed-width** input box (175/170px), `hug` cells, 40px column gap.
- Rows carry 1 or 2 fields. **Single fields sit flush left at column width — never stretched, never offset.** Rhythm is semantic: the section's anchor stands alone (Underlying, Return type); parallel params pair up; unpartnered settings stand alone (Currency, Borrow spread, Fixing lag, Rate floor, Execution fee…).
- **Derived read-only fields**: `canvas` fill, `divider` border, `text-secondary` value (Net carry rate, Time to expiry, Term, Business days).
- Section heads: 9px Medium muted, 6% letterspacing.
- Known open question: abbreviated values (`Receive TR`, `Mod. following`, `Payment freq.`) — widen boxes to ~200px to restore full words if they read as clipped.

## 9. Established UI vocabulary

- **Standard chevron**: `down-arrow` component `30:23`, instance rescaled to 10px, vector strokes bound `text-muted`. No `▾` text glyphs anywhere.
- **Dashed border [3,3] = empty add slot** (`+ Add rule…`, `+ Add constraint…`, `+ Add index…`, `+ Add block…`).
- **Tables**: surface card, radius 6; hug content; 24–28px rows; zebra via `canvas`; thead 10px Medium muted + bottom divider; numerics right-aligned; signed values success/danger; total rows top-divided, Medium; 4px scrollbar thumb `text-muted` @45% when clipped.
- **Footnote provenance line**: 11px muted; counts, spans, reconciliation identities (`Σ = 100.00`, `TE² = 3.24`), sources; optional accent action.
- **Charts**: accent line 1.5px, divider gridlines, muted 10px axes, last-value marker; benchmark lines `text-secondary` 1px; drawdown subpanels computed from the plotted series; diverging bars grow from a centre divider axis (success right / danger left).
- **Colormap exception**: risk heatmap uses raw-RGB green→amber→red (LOW ≈ (76,165,107), MID ≈ (217,179,76), HIGH ≈ (202,88,81)), mode-independent by approval; legend = 40-swatch gradient labelled 0.2 → 1.0, "less ↔ more correlated". Green = diversifying.
- **Paper preview** (Reports): 540×764 page on raw white with drop shadow; **everything inside the page is raw ink** (mode-independent by design); surrounding chrome fully tokenised. Page furniture: running header rule, footer rule, `py-beacon <ver> · generated <date>`, `Page n of m`.

## 10. Cross-view integrity

Numbers reconcile app-wide off one dataset: TECH10 base 100 (31 Dec 2019) → **341.34**; weights sum 100.00 with three names capped; attribution +15.13 − 0.84 cap drag − 0.09 costs = **+14.20 YTD**; optimiser Δ sums to 0.00; TE 1.8% ↔ TE² 3.24 decomposition; futures fair values are literal `S·e^((r−q)T)`; TRS accruals are literal ACT/360 on $250M; TRS resets land on the same index levels the charts plot. New mock data must join this web, not invent parallel numbers.

## 11. Open items

1. Pane-header retrofit across ~25 panes (component exists; swap deliberately deferred).
2. Dedicated series-colour tokens (`series-2`, `series-3`) — compare lines still borrow success/danger.
3. Rename Tab label layer `Prices` → `label`.
4. `CUSTOM` segment for the range control.
5. Fundamentals frames still at page x≈9560 — reposition into the grid.
6. AI Assistant header-bg: duplicate hardcoded-navy rect over the tokenised one — **owner is experimenting manually; do not touch until asked.**
7. Pricer input width: widen to ~200px if abbreviations feel clipped.
