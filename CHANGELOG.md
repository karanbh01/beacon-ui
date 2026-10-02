# Changelog

What changed in each release of Beacon, the desktop app for py-beacon. The newest release is first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers follow [Semantic Versioning](https://semver.org/), as py-beacon's do. The home page shows this list beside py-beacon's, so a line here is written to be read there.

## [Unreleased]

### Changed

- The home page's changelog is wider again and sits against the right edge, under the date, instead of floating mid-page on a wide window.
- The home page's changelog runs down to Guides instead of stopping short.
- The constituent preview draws its table sooner: it no longer asks the engine for trading volumes it never showed, about a fifth of the wait.
- While a constituent preview calculates, an animated orb says so.

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
