import type { components } from '@shared/api.generated'

export type FeatureResponse = components['schemas']['FeatureResponse']
export type FeatureCatalogue = components['schemas']['FeatureCatalogue']

export interface FeatureRow {
  field: string
  value: number | null
  /** The feature dataset it came from — 'fundamentals', 'alternative'. */
  dataset: string | undefined
  /** When this datapoint became true, which is not the as-of date. */
  date: string | undefined
  /** The engine's own words: "period ending 2026-06-30, reported 2026Q2". */
  detail: string | undefined
  /** False when the engine holds no value for this name. */
  held: boolean
}

/**
 * The engine's answer, as rows (BU-99).
 *
 * `GET /data/features/{identifier}` returns every field in the catalogue, with
 * nulls where this name has none — so a company with fundamentals but no
 * alternative data comes back carrying both, four filled and two empty. That
 * is worth drawing: "we hold no sentiment for this" is an answer, and hiding
 * the row would make it look like the field does not exist.
 */
export function featureRows(response: FeatureResponse | undefined): FeatureRow[] {
  return (response?.features ?? []).map((entry) => ({
    field: entry.field,
    value: typeof entry.value === 'number' ? entry.value : null,
    dataset: entry.type ?? undefined,
    date: typeof entry.date === 'string' ? entry.date.slice(0, 10) : undefined,
    detail: entry.detail ?? undefined,
    held: entry.value !== null
  }))
}

/** Rows for one dataset, in catalogue order. Empty means "not this one". */
export function rowsOfDataset(rows: readonly FeatureRow[], dataset: string): FeatureRow[] {
  return rows.filter((row) => row.dataset === dataset)
}

/**
 * `debt_to_equity` → "Debt to equity", `pe_ratio` → "Pe ratio".
 *
 * Same treatment the universe builder gives a reference column, and the same
 * reason: these are engine field names, and the app should not carry a
 * translation table that goes stale the moment a dataset gains a field.
 */
export function fieldLabel(field: string): string {
  const spaced = field.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A ratio and a page-view count want different precision, and the engine
 * publishes no format. Magnitude is the only signal available: anything under
 * a thousand reads as a ratio, anything above as a count.
 */
export function featureValue(value: number | null): string {
  if (value === null) return '—'
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/** Datasets the catalogue declares, in the order it declares them. */
export function datasetsOf(catalogue: FeatureCatalogue | undefined): string[] {
  return (catalogue?.types ?? []).map((entry) => entry.type)
}
