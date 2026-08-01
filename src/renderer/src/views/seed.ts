import type { OpenTabInput } from '../state/tabs.logic'

/**
 * Tabs opened on a fresh workspace, one or two per page, so the shell has
 * something to show before any live view exists.
 *
 * Applied only when the persisted workspace is empty — reopening the app
 * must never resurrect tabs the user closed.
 */
export const SEED_TABS: readonly OpenTabInput[] = [
  {
    id: 'seed-prices',
    page: 'data-explorer',
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    subject: 'AAPL'
  },
  {
    id: 'seed-charting',
    page: 'data-explorer',
    viewKind: 'charting',
    archetype: 'linked',
    title: 'Charting',
    linkSourceId: 'seed-prices'
  },
  {
    id: 'seed-reference',
    page: 'data-explorer',
    viewKind: 'reference-data',
    archetype: 'query',
    title: 'Reference Data',
    subject: 'AAPL'
  },
  {
    id: 'seed-corporate-actions',
    page: 'data-explorer',
    viewKind: 'corporate-actions',
    archetype: 'query',
    title: 'Corporate Actions',
    subject: 'AAPL'
  },
  {
    id: 'seed-watchlist',
    page: 'data-explorer',
    viewKind: 'watchlist',
    archetype: 'global',
    title: 'Watchlist'
  },
  {
    id: 'seed-coverage',
    page: 'data-explorer',
    viewKind: 'data-coverage',
    archetype: 'global',
    title: 'Data Coverage'
  },
  {
    id: 'seed-overview',
    page: 'beacon-view',
    viewKind: 'overview',
    archetype: 'pinned',
    title: 'Overview',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-weights',
    page: 'beacon-view',
    viewKind: 'weights',
    // `query`, not `pinned`: the pin names the index, but the SUBJECT is the
    // constituent the user selects, which is what Drilldown links to.
    archetype: 'query',
    title: 'Weights',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-tech10',
    page: 'strategy-builder',
    viewKind: 'index-definition',
    archetype: 'document',
    title: 'TECH10'
  },
  {
    id: 'seed-universe',
    page: 'strategy-builder',
    viewKind: 'universe-set',
    archetype: 'query',
    title: 'Universe Set'
  },
  {
    id: 'seed-preview',
    page: 'strategy-builder',
    viewKind: 'constituent-preview',
    archetype: 'query',
    title: 'Constituent Preview',
    subject: 'TECH10'
  },
  {
    id: 'seed-attribution',
    page: 'beacon-view',
    viewKind: 'attribution',
    archetype: 'pinned',
    title: 'Attribution',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-drilldown',
    page: 'beacon-view',
    viewKind: 'asset-drilldown',
    archetype: 'linked',
    title: 'Drilldown',
    linkSourceId: 'seed-weights',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-comparison',
    page: 'beacon-view',
    viewKind: 'comparison',
    archetype: 'pinned',
    title: 'Comparison',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-backtest',
    page: 'beacon-view',
    viewKind: 'backtest',
    archetype: 'pinned',
    title: 'Backtest',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-constraints',
    page: 'optimiser',
    viewKind: 'constraint-set',
    archetype: 'query',
    title: 'Constraint Set'
  },
  {
    id: 'seed-opt-run',
    page: 'optimiser',
    viewKind: 'optimisation-run',
    archetype: 'query',
    title: 'Run',
    subject: 'TECH10'
  },
  {
    id: 'seed-frontier',
    page: 'optimiser',
    viewKind: 'frontier',
    archetype: 'query',
    title: 'Frontier'
  },
  {
    id: 'seed-exposures',
    page: 'optimiser',
    viewKind: 'factor-exposures',
    archetype: 'query',
    title: 'Exposures'
  },
  {
    id: 'seed-risk-model',
    page: 'optimiser',
    viewKind: 'risk-model',
    archetype: 'query',
    title: 'Risk Model'
  },
  {
    id: 'seed-futures',
    page: 'derivatives',
    viewKind: 'futures-pricer',
    archetype: 'global',
    title: 'Futures'
  },
  {
    id: 'seed-trs',
    page: 'derivatives',
    viewKind: 'trs-pricer',
    archetype: 'global',
    title: 'TRS'
  },
  {
    id: 'seed-term-structure',
    page: 'derivatives',
    viewKind: 'term-structure',
    archetype: 'pinned',
    title: 'Term Structure',
    pinnedDoc: 'TECH10'
  },
  {
    id: 'seed-factsheet',
    page: 'reports',
    viewKind: 'factsheet',
    archetype: 'document',
    title: 'FACTSHEET-A4'
  }
]
