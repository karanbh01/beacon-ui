import type { components } from '@shared/api.generated'

export type DatasetCoverage = components['schemas']['DatasetCoverage']

/**
 * How old a dataset may get before it is stale.
 *
 * Figma's footnote says "stale = last update older than dataset frequency",
 * but `DatasetCoverage` carries no frequency — so the frequency lives here,
 * per dataset, and the pane says so rather than implying the engine decided.
 * An unknown dataset gets the daily threshold: calling something stale a day
 * early is a nudge, calling it fresh for a week is a lie.
 */
const STALE_AFTER_S: Record<string, number> = {
  market: 24 * 3600,
  reference: 7 * 24 * 3600
}

const DEFAULT_STALE_AFTER_S = 24 * 3600

export type CoverageStatus = 'ok' | 'stale' | 'never' | 'absent'

/**
 * Four states, not two.
 *
 * py-beacon distinguishes "not loaded at all" (`configured` false) from
 * "loaded and never refreshed" (`cache_age` null) explicitly, and the
 * difference decides what the user should do: configure a source, or sync.
 */
export function statusOf(row: DatasetCoverage): CoverageStatus {
  if (!row.configured) return 'absent'
  if (row.cache_age === null || row.cache_age === undefined) return 'never'
  const limit = STALE_AFTER_S[row.dataset] ?? DEFAULT_STALE_AFTER_S
  return row.cache_age > limit ? 'stale' : 'ok'
}

export function statusLabel(status: CoverageStatus): string {
  if (status === 'ok') return 'OK'
  if (status === 'stale') return 'Stale'
  if (status === 'never') return 'Never synced'
  return 'Not loaded'
}

/** 7_200 → "2h ago". Nothing here is precise enough to deserve seconds. */
export function describeAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 90) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${String(minutes)}m ago`
  const hours = Math.round(seconds / 3600)
  if (hours < 48) return `${String(hours)}h ago`
  return `${String(Math.round(seconds / 86_400))}d ago`
}

/** "1962 → 2026" from the two ends, or a dash when the dataset holds none. */
export function describeSpan(row: DatasetCoverage): string {
  const start = row.start?.slice(0, 4)
  const end = row.end?.slice(0, 4)
  if (start === undefined && end === undefined) return '—'
  if (start === end) return start ?? end ?? '—'
  return `${start ?? '?'} → ${end ?? '?'}`
}

/** "market" → "Market". Dataset names are engine identifiers, not prose. */
export function datasetLabel(dataset: string): string {
  const words = dataset.replace(/[_-]+/g, ' ').trim()
  if (words === '') return dataset
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface CoverageSummary {
  datasets: number
  configured: number
  /**
   * Identifiers in the largest dataset, NOT a total.
   *
   * The response reports a distinct count per dataset and nothing about the
   * overlap between them, so summing would double-count every instrument
   * that has both prices and reference data — which is most of them. The
   * label says "largest dataset" for exactly this reason.
   */
  largest: number
  stale: number
  /** Freshest `cache_age` across configured datasets. */
  newestAge: number | undefined
}

export function summarise(rows: readonly DatasetCoverage[]): CoverageSummary {
  const configured = rows.filter((row) => row.configured)
  const ages = configured
    .map((row) => row.cache_age)
    .filter((age): age is number => age !== null && age !== undefined)

  return {
    datasets: rows.length,
    configured: configured.length,
    largest: rows.reduce((most, row) => Math.max(most, row.identifiers), 0),
    stale: rows.filter((row) => statusOf(row) === 'stale').length,
    newestAge: ages.length === 0 ? undefined : Math.min(...ages)
  }
}

/** Datasets first, then the filter's option list, both from the response. */
export function datasetOptions(
  rows: readonly DatasetCoverage[]
): { value: string; label: string }[] {
  return [
    { value: '', label: 'All datasets' },
    ...rows.map((row) => ({ value: row.dataset, label: datasetLabel(row.dataset) }))
  ]
}

export function filterByDataset(
  rows: readonly DatasetCoverage[],
  dataset: string
): DatasetCoverage[] {
  if (dataset === '') return [...rows]
  return rows.filter((row) => row.dataset === dataset)
}
