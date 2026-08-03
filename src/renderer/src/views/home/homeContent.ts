import type { PillStatus } from '@/components/Badge/Badge'

/**
 * The Home screen's fixed content (Figma 7:113).
 *
 * Quickstart, Changelog and Guides are authored rather than fetched: they
 * describe the app, not the data. Recent Activity is the one section with a
 * live source, and it comes from the workspace and job stores.
 */

export interface QuickstartAction {
  id: string
  label: string
  icon: string
  /** Sidebar page to switch to, and the tab to open there. */
  page: string
  tab: string
}

/**
 * Each item opens something that already exists — no dead entries. The icon
 * names resolve through the generated registry, so a rename fails the build
 * rather than rendering a blank.
 */
/**
 * The glyphs are the sidebar's own page icons, so an item and the place it
 * lands on carry the same mark. Figma draws five 16px glyphs from the same
 * set (76:10…104:1794).
 */
export const QUICKSTART: readonly QuickstartAction[] = [
  {
    id: 'create-index',
    label: 'Create Index…',
    icon: 'layers',
    page: 'strategy-builder',
    tab: 'seed-tech10'
  },
  {
    id: 'run-backtest',
    label: 'Run Backtest…',
    icon: 'line-chart',
    page: 'beacon-view',
    tab: 'seed-backtest'
  },
  {
    id: 'optimise-index',
    label: 'Optimise Index…',
    icon: 'cube',
    page: 'optimiser',
    tab: 'seed-frontier'
  },
  {
    id: 'generate-report',
    label: 'Generate Performance & Attribution Report…',
    icon: 'folder-open',
    page: 'reports',
    tab: 'seed-factsheet'
  },
  {
    id: 'price-derivatives',
    label: 'Price Index Derivatives…',
    icon: 'blockchain',
    page: 'derivatives',
    tab: 'seed-futures'
  }
]

export interface ChangelogEntry {
  version: string
  /** `current` marks the running build; anything else is history. */
  pill?: { label: string; status: PillStatus }
  summary: string
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: 'v0.0.2',
    pill: { label: 'current', status: 'info' },
    summary: 'Derivatives module, asset views, lookthrough groundwork'
  },
  { version: 'v0.0.1', summary: 'Core index calculator, backtest engine, portfolio' }
]

export interface Guide {
  title: string
  subtitle: string
}

export const GUIDES: readonly Guide[] = [
  { title: 'Define your first index', subtitle: 'Rules, weights, rebalance' },
  { title: 'Run a backtest', subtitle: 'Costs, tracking, NAV' },
  { title: 'Read tracking metrics', subtitle: 'TE, TD, attribution' }
]

/**
 * `Thursday 16 July 2026` — the frame's format, spelled out in full.
 *
 * Takes the date rather than reading the clock so the caller owns time; a
 * component that calls `new Date()` itself cannot be tested on a fixed day.
 */
export function formatHomeDate(date: Date): string {
  // Composed part by part rather than as one format call: en-GB puts a comma
  // after the weekday and the frame has none, and punctuation is not
  // something to leave to a locale when the design has decided it.
  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-GB', options).format(date)

  return [
    part({ weekday: 'long' }),
    part({ day: 'numeric' }),
    part({ month: 'long' }),
    part({ year: 'numeric' })
  ].join(' ')
}
