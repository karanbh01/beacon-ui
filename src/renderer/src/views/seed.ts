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
    archetype: 'pinned',
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
    id: 'seed-constraints',
    page: 'optimiser',
    viewKind: 'constraint-set',
    archetype: 'global',
    title: 'Constraint Set'
  },
  {
    id: 'seed-futures',
    page: 'derivatives',
    viewKind: 'futures-pricer',
    archetype: 'pinned',
    title: 'Futures',
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
