# Changelog

What changed in each release of Beacon, the desktop app for py-beacon. The newest release is first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers follow [Semantic Versioning](https://semver.org/), as py-beacon's do. The home page shows this list beside py-beacon's, so a line here is written to be read there.

## [Unreleased]

## [0.2.1] - 2026-10-21

Fixes to 0.2.0: jobs that finish while the connection drops, forms that keep what you typed, new work that opens straight onto its form, and empty states drawn and centred.

### Fixed

- A job finishes in the tray even when its last update was missed. Loading synthetic data no longer stops at 92%.
- A form keeps what you typed when you look at another tab, in every view.
- The capital and flows table in Backtest narrows with its pane when panes sit side by side.
- Every empty view has its drawing, centred in the pane, including Attribution and Strategy.
- An input py-beacon refuses is headed as a refusal, not as "Could not load".

### Changed

- New backtest, New strategy and New index open straight onto the form. A backtest's strategy is chosen in the form, and a strategy's or index's id is typed there and checked as you go.

## [0.2.0] - 2026-10-20

Strategies: build one in Strategy Builder, backtest it in Beacon View, and read its holdings and figures in py-beacon's own style. py-beacon 0.9.3 inside.

### Added

- Strategy Builder has a Strategy view. Hold an index as defined, track it through a replication, or build an active portfolio from a signal, an optimiser and constraints. Screens, caps, cash, trading and futures are rows you add and open, as an index's methodology is.
- Settings with a shape of their own are edited in that shape: constraints as rows, a field picker, ticker lists and tables, sector and region ticks, and named factors with their targets.
- The Backtest tab runs a saved strategy, starting from the settings of its last run, and lists every run when no strategy is chosen.
- Holdings, which was Weights, shows one day of the strategy's workflow: from the universe through each rule, screen and cap to the fund's weights and shares, with the drift since the last rebalance. Hover a rule's column to see what it does.
- Portfolio shows the fund's own weights over time, with the index's and the benchmark's beside them.
- Results tables sort and filter from their column names.
- Tables of tickers can show reference columns beside them, chosen once for every table or for one table.
- Empty views draw what is missing: a ticker tape waiting for a symbol, a calendar with no date picked, a drawer, a card index or a shelf with one binder gone.

### Changed

- The Overview follows the strategy, and every figure on it is py-beacon's.
- Charts and tables are drawn in py-beacon's style.
- The home page opens under drifting Greek glyphs, with Quickstart above a short changelog, the full list a click away, and a small figure on each guide. It fits the window without scrolling.
- The constituent preview lists the whole starting universe with each name's universe weight, draws its table sooner, narrows with the window before it scrolls, and shows an orb while it calculates.
- A tab keeps what it was showing when you come back to it.
- Universe Set and Index Definition have a back button to their lists, and Constituent Preview has its own index search.
- Data → Data Preferences chooses the unit money amounts read in and the decimal places on large numbers.
- A new app icon: Beacon's cube logo.
- Backtests receive dividends, size their buys net of costs and keep their book in the index's currency. A data store saved before py-beacon 0.7.0 can no longer be used, and Manage sources says so and how to fix it.

## [0.1.1] - 2026-10-02

Fixes to 0.1.0: a changelog you can read at a glance, and an installer in Beacon's colours.

### Changed

- The home page's changelog is wider, so each release's summary reads as a line rather than a column of fragments.
- The installer carries Beacon's colours and the β cube in its header and on its welcome and finish pages.

## [0.1.0] - 2026-10-02

The first release, for Windows, with py-beacon 0.3.1 inside: load data, define an index, back-test it, read the result.

### Added

- Data Explorer: prices with a chart, reference data, corporate actions, features, the database browser, watchlists and data coverage.
- Strategy Builder: universes built from pasted names or by filtering the dataset, index definitions with validation as you edit, and a constituent preview at each rebalance date.
- Beacon View: an index's overview, risk and statistics, weights over time, drilldown, comparison between indices, and backtests with costs and a benchmark.
- Data sources: the engine starts with or without data, and the footer says when none is loaded. Generate synthetic data, open a data folder or import CSV files and workbooks from the Data menu, then switch, rename, refresh or remove stores in Manage sources.
- Panes, layouts and saved presets per page, search across identifiers, views and indices, a job tray and a footer that reports background work.
- Light and dark themes, and updates offered from inside the app.
- This changelog on the home page, with py-beacon's releases beside the app's.
