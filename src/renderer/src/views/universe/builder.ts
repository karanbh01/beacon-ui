/**
 * Building a universe by filtering the dataset (BU-85).
 *
 * The same shape as building an index: narrow the loaded names with filters
 * until the set is the one you meant, then save it. What differs is that an
 * index's pipeline is evaluated by py-beacon at rebalance, and this is
 * evaluated here and now — a universe is a membership LIST, so the answer has
 * to be visible before it is stored.
 *
 * **The filters are derived from the data, not declared here.** Karan asked
 * for region, country, sector, market cap and rank. Probing a running engine,
 * the reference frame carries `NAME, SECTOR, SUB_INDUSTRY, EXCHANGE,
 * CURRENCY` and one derived field, `adv_3m` — no region, no country, no
 * market cap anywhere. Hard-coding those five would ship three dropdowns that
 * are permanently empty and read as broken. Instead every categorical column
 * the engine returns becomes its own filter and every numeric one a range, so
 * the three missing dimensions appear on their own the day py-beacon
 * publishes them.
 */

export interface Candidate {
  identifier: string
  fields: Record<string, unknown>
}

export type FilterKind = 'category' | 'range'

export interface FilterSpec {
  /** The reference column, as the engine spells it. */
  field: string
  /** Title-cased for display: `SUB_INDUSTRY` → "Sub industry". */
  label: string
  kind: FilterKind
  /** Every distinct value, sorted. Categorical only. */
  values?: string[]
  /** Bounds across the pool. Range only. */
  min?: number
  max?: number
}

/**
 * Columns that are never a filter.
 *
 * `NAME` is an identity, not a dimension — a multi-select of 512 company
 * names is a list of the thing you are trying to narrow. The validity dates
 * describe the ROW rather than the instrument.
 */
const NOT_A_DIMENSION = new Set(['name', 'date_from', 'date_to', 'identifier'])

/**
 * Above this a categorical column is an identity rather than a dimension.
 *
 * `SUB_INDUSTRY` has dozens of values and is still worth filtering on; a
 * column with one value per name is not.
 */
const MAX_CATEGORIES = 60

/** `SUB_INDUSTRY` → "Sub industry", `adv_3m` → "Adv 3m". */
export function labelFor(field: string): string {
  const spaced = field.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * What can be filtered on, given what came back.
 *
 * Scans every candidate rather than the first: a column absent from one
 * instrument's row is still a real column, and reference data is ragged.
 */
export function filtersFor(candidates: readonly Candidate[]): FilterSpec[] {
  const strings = new Map<string, Set<string>>()
  const numbers = new Map<string, { min: number; max: number }>()

  for (const candidate of candidates) {
    for (const [field, value] of Object.entries(candidate.fields)) {
      if (NOT_A_DIMENSION.has(field.toLowerCase())) continue

      if (typeof value === 'string' && value !== '') {
        const seen = strings.get(field) ?? new Set<string>()
        seen.add(value)
        strings.set(field, seen)
        continue
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        const bounds = numbers.get(field)
        numbers.set(
          field,
          bounds === undefined
            ? { min: value, max: value }
            : { min: Math.min(bounds.min, value), max: Math.max(bounds.max, value) }
        )
      }
    }
  }

  const categories: FilterSpec[] = []
  const ranges: FilterSpec[] = []

  for (const [field, values] of strings) {
    // One value across the whole pool narrows nothing; too many and it is an
    // identity column rather than a dimension.
    if (values.size < 2 || values.size > MAX_CATEGORIES) continue
    categories.push({
      field,
      label: labelFor(field),
      kind: 'category',
      values: [...values].sort((a, b) => a.localeCompare(b))
    })
  }

  for (const [field, bounds] of numbers) {
    if (bounds.min === bounds.max) continue
    ranges.push({ field, label: labelFor(field), kind: 'range', ...bounds })
  }

  // Categories first: sector or region is how a universe is described, and a
  // numeric bound is the refinement afterwards. Sorting the two kinds together
  // by label would put "Adv 3m" above "Sector" for no reason anyone reading
  // the form would recognise.
  const byLabel = (a: FilterSpec, b: FilterSpec): number => a.label.localeCompare(b.label)
  return [...categories.sort(byLabel), ...ranges.sort(byLabel)]
}

/** What the user has actually chosen. Absent means "not filtering on this". */
export interface FilterState {
  /** field → chosen values. An empty set means no constraint. */
  categories: Record<string, string[] | undefined>
  /** field → [min, max], either end optional. */
  ranges: Record<string, { min?: number; max?: number } | undefined>
  /** Keep only the top N by this field, applied last. */
  rank?: { field: string; count: number; direction: 'top' | 'bottom' }
}

export function emptyFilters(): FilterState {
  return { categories: {}, ranges: {} }
}

/**
 * True when nothing has been chosen.
 *
 * `applyFilters` on an untouched state returns the whole pool, which is the
 * right answer for a filter and the wrong one for a builder: opening the form
 * would pre-select all 500 names, and anyone wanting to type five tickers by
 * hand would first have to exclude the dataset. So the filters ADD to the
 * membership rather than subtract from it, and contribute nothing until one is
 * set. A rank on its own counts — "the top 100 by volume" is a choice.
 */
export function noneChosen(filters: FilterState): boolean {
  const category = Object.values(filters.categories).some(
    (chosen) => chosen !== undefined && chosen.length > 0
  )
  const range = Object.values(filters.ranges).some(
    (bounds) => bounds !== undefined && (bounds.min !== undefined || bounds.max !== undefined)
  )
  return !category && !range && filters.rank === undefined
}

function numberAt(candidate: Candidate, field: string): number | undefined {
  const value = candidate.fields[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Apply every filter, then the rank.
 *
 * Rank is LAST on purpose: "the ten largest technology names" is the ten
 * largest of the technology ones, not the technology ones among the ten
 * largest. Ordering it the other way is a different — and almost always
 * unintended — question.
 */
export function applyFilters(candidates: readonly Candidate[], filters: FilterState): Candidate[] {
  let matched = [...candidates]

  for (const [field, chosen] of Object.entries(filters.categories)) {
    if (chosen === undefined || chosen.length === 0) continue
    const wanted = new Set(chosen)
    matched = matched.filter((candidate) => {
      const value = candidate.fields[field]
      return typeof value === 'string' && wanted.has(value)
    })
  }

  for (const [field, bounds] of Object.entries(filters.ranges)) {
    if (bounds === undefined) continue
    const { min, max } = bounds
    if (min === undefined && max === undefined) continue
    matched = matched.filter((candidate) => {
      const value = numberAt(candidate, field)
      if (value === undefined) return false
      if (min !== undefined && value < min) return false
      if (max !== undefined && value > max) return false
      return true
    })
  }

  const rank = filters.rank
  if (rank !== undefined && rank.count > 0) {
    // Names with no value for the ranked field cannot be ranked, so they are
    // dropped rather than sorted to one end and silently kept or lost.
    matched = matched
      .filter((candidate) => numberAt(candidate, rank.field) !== undefined)
      .sort((a, b) => {
        const left = numberAt(a, rank.field) ?? 0
        const right = numberAt(b, rank.field) ?? 0
        return rank.direction === 'top' ? right - left : left - right
      })
      .slice(0, rank.count)
  }

  return matched
}

export interface ManualResult {
  /** Present in the dataset, so it can be a member. */
  found: string[]
  /** Typed but not in the dataset — named rather than silently dropped. */
  unknown: string[]
}

/**
 * Check typed identifiers against the loaded dataset.
 *
 * The point of BU-85's "I cannot confirm the ticker is validated": a symbol
 * that is not in the data will be refused by the engine at save time, and
 * finding that out then — for one name out of forty — is no use.
 */
export function checkManual(entered: readonly string[], pool: ReadonlySet<string>): ManualResult {
  const found: string[] = []
  const unknown: string[] = []

  for (const identifier of entered) {
    if (pool.has(identifier)) found.push(identifier)
    else unknown.push(identifier)
  }
  return { found, unknown }
}

/**
 * The saved membership: everything the filters matched, plus what was added
 * by hand, in that order and without duplicates.
 */
export function combine(matched: readonly Candidate[], manual: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const candidate of matched) {
    if (seen.has(candidate.identifier)) continue
    seen.add(candidate.identifier)
    out.push(candidate.identifier)
  }
  for (const identifier of manual) {
    if (seen.has(identifier)) continue
    seen.add(identifier)
    out.push(identifier)
  }
  return out
}
