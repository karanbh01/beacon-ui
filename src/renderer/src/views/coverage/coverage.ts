import type { components } from '@shared/api.generated'

export type DatasetCoverage = components['schemas']['DatasetCoverage']

/**
 * Fallback threshold, used only when the engine sends none.
 *
 * The per-dataset thresholds used to live here — market 24h, reference 7d —
 * because `DatasetCoverage` carried no frequency and Figma's footnote defines
 * stale in terms of one. BN-119 added `stale_after_seconds`, so the engine
 * decides now, which is where it belonged: it knows how often each source
 * actually refreshes and this file was guessing.
 *
 * A day is kept for the case where a dataset arrives without one. Calling
 * something stale a day early is a nudge; calling it fresh for a week is a
 * lie.
 */
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
  const limit = row.stale_after_seconds ?? DEFAULT_STALE_AFTER_S
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
   * Distinct identifiers across every dataset, from `identifiers_union`.
   *
   * This was `largest` — identifiers in the biggest dataset — because the
   * response gave a per-dataset count and nothing about the overlap, so
   * summing double-counted every instrument holding both prices and
   * reference data. BN-119 publishes the union, which is the number Figma's
   * ASSETS COVERED always meant.
   */
  assets: number
  stale: number
  /** Freshest `cache_age` across configured datasets. */
  newestAge: number | undefined
  /** Distinct upstream providers, for the SOURCES stat. */
  sources: number
  /** Reference columns held, summed across datasets. */
  fields: number
  /** Bytes on disk, from the response rather than per dataset. */
  cacheBytes: number | undefined
}

export function summarise(
  rows: readonly DatasetCoverage[],
  response?: { identifiers_union?: number; cache_size_bytes?: number | null }
): CoverageSummary {
  const configured = rows.filter((row) => row.configured)
  const ages = configured
    .map((row) => row.cache_age)
    .filter((age): age is number => age !== null && age !== undefined)

  const sources = new Set(
    rows.map((row) => row.source).filter((source): source is string => Boolean(source))
  )

  return {
    datasets: rows.length,
    configured: configured.length,
    // Falls back to the largest dataset when the union is absent, which is
    // still better than a sum that double-counts.
    assets:
      response?.identifiers_union ?? rows.reduce((most, row) => Math.max(most, row.identifiers), 0),
    stale: rows.filter((row) => statusOf(row) === 'stale').length,
    newestAge: ages.length === 0 ? undefined : Math.min(...ages),
    sources: sources.size,
    fields: rows.reduce((total, row) => total + row.field_count, 0),
    cacheBytes: response?.cache_size_bytes ?? undefined
  }
}

/** "1.4 GB". Bytes on disk are read at a glance, never to the byte. */
export function describeBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : String(Math.round(value))} ${units[unit] ?? 'B'}`
}

/** "Daily", "1-min", "Static" — the engine's own word, title-cased. */
export function frequencyLabel(frequency: string | null | undefined): string {
  if (frequency === null || frequency === undefined || frequency === '') return '—'
  return frequency.charAt(0).toUpperCase() + frequency.slice(1)
}

export function sourceLabel(source: string | null | undefined): string {
  return source === null || source === undefined || source === '' ? '—' : source
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
