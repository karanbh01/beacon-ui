/**
 * Building a universe by filtering the dataset (BU-85).
 *
 * The same shape as building an index: narrow the loaded names with filters
 * until the set is the one you meant, then save it. What differs is that an
 * index's pipeline is evaluated by py-beacon at rebalance, and this is
 * evaluated here and now — a universe is a membership LIST, so the answer has
 * to be visible before it is stored.
 *
 * **The filters are derived from the data, not declared here.** The ask was
 * region, country, sector, market cap and rank. At the time the reference
 * frame carried none of the first, second or fourth, so hard-coding those
 * five would have shipped three dropdowns that were permanently empty and
 * read as broken. Instead every categorical column the engine returns becomes
 * a dimension and every numeric one a range.
 *
 * That paid off: BN-128 added REGION, COUNTRY_LISTING and COUNTRY_DOMICILE,
 * and widened CURRENCY past one value — six new filters, no client change.
 * Market cap is the one thing still missing; see
 * `docs/engine-requests/reference-dimensions.md`.
 *
 * The filters are applied as an ORDERED LIST OF ROWS (BU-90), each reporting
 * what survived it, rather than as a panel of every dimension at once.
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

/**
 * One filter, as a row (BU-90).
 *
 * The builder used to draw every dimension at once — seven fieldsets and 67
 * checkboxes before the user had expressed an intent, and no indication of
 * what any one of them cost. Rows are the index designer's grammar: add one,
 * see what it leaves, add another.
 *
 * A row's behaviour follows its FIELD rather than being declared: a
 * categorical column matches values, a numeric one bounds them. Rank is the
 * exception and is its own kind, because "top 100 by volume" is a different
 * question from "volume above X" over the same column.
 */
export interface FilterRow {
  id: string
  kind: 'filter' | 'rank'
  /** Reference column. Empty until a dimension is chosen. */
  field: string
  /** Chosen values, for a row whose field is categorical. */
  values: string[]
  /**
   * Bounds, for a row whose field is numeric. Either end optional, and
   * explicitly `| undefined` because clearing a box has to be able to SET
   * undefined — `exactOptionalPropertyTypes` distinguishes the two.
   */
  min?: number | undefined
  max?: number | undefined
  /** How many to keep, for a rank row. */
  count?: number | undefined
  direction: 'top' | 'bottom'
}

function numberAt(candidate: Candidate, field: string): number | undefined {
  const value = candidate.fields[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

let rowCounter = 0

export function newRow(kind: FilterRow['kind'] = 'filter'): FilterRow {
  rowCounter += 1
  return { id: `row-${String(rowCounter)}`, kind, field: '', values: [], direction: 'top' }
}

function specFor(specs: readonly FilterSpec[], field: string): FilterSpec | undefined {
  return specs.find((spec) => spec.field === field)
}

/**
 * Whether a row says anything yet.
 *
 * An incomplete row is a no-op rather than a match-nothing: a half-built row
 * emptying the table reads as a filter that has gone wrong, when in fact the
 * user is still mid-thought.
 */
export function isComplete(row: FilterRow, specs: readonly FilterSpec[]): boolean {
  const spec = specFor(specs, row.field)
  if (spec === undefined) return false
  if (row.kind === 'rank') return spec.kind === 'range' && (row.count ?? 0) > 0
  if (spec.kind === 'category') return row.values.length > 0
  return row.min !== undefined || row.max !== undefined
}

function applyRow(candidates: readonly Candidate[], row: FilterRow, spec: FilterSpec): Candidate[] {
  if (row.kind === 'rank') {
    const count = row.count ?? 0
    // Names with no value for the ranked field cannot be ranked, so they are
    // dropped rather than sorted to one end and silently kept or lost.
    return candidates
      .filter((candidate) => numberAt(candidate, row.field) !== undefined)
      .sort((a, b) => {
        const left = numberAt(a, row.field) ?? 0
        const right = numberAt(b, row.field) ?? 0
        return row.direction === 'top' ? right - left : left - right
      })
      .slice(0, count)
  }

  if (spec.kind === 'category') {
    const wanted = new Set(row.values)
    return candidates.filter((candidate) => {
      const value = candidate.fields[row.field]
      return typeof value === 'string' && wanted.has(value)
    })
  }

  return candidates.filter((candidate) => {
    const value = numberAt(candidate, row.field)
    if (value === undefined) return false
    if (row.min !== undefined && value < row.min) return false
    if (row.max !== undefined && value > row.max) return false
    return true
  })
}

export interface RunResult {
  /** What the rows matched, in pool order. */
  matched: Candidate[]
  /**
   * Names surviving each row, aligned to `rows`. `undefined` where the row is
   * incomplete and therefore did nothing.
   */
  remaining: (number | undefined)[]
}

/**
 * Apply the rows top to bottom.
 *
 * **In the order given**, which is a change from the single filter panel this
 * replaced: that one always applied rank last, on the reasoning that "the ten
 * largest technology names" means the ten largest OF the technology ones. The
 * reasoning still holds, but with rows the user states the order themselves
 * and the per-row counts show what it cost — a hidden rule that quietly
 * reorders what someone wrote is worse than a visible one they can move.
 *
 * No complete row means no members. `applyRow` over an empty row list would
 * return the whole pool, which is right for a filter and wrong for a builder:
 * opening the form must not pre-select five thousand names.
 */
export function runRows(
  pool: readonly Candidate[],
  rows: readonly FilterRow[],
  specs: readonly FilterSpec[]
): RunResult {
  let matched = [...pool]
  const remaining: (number | undefined)[] = []
  let any = false

  for (const row of rows) {
    const spec = specFor(specs, row.field)
    if (spec === undefined || !isComplete(row, specs)) {
      remaining.push(undefined)
      continue
    }
    any = true
    matched = applyRow(matched, row, spec)
    remaining.push(matched.length)
  }

  return { matched: any ? matched : [], remaining }
}

/** The row in words, for the summary the index designer's rows also carry. */
export function describeRow(row: FilterRow, specs: readonly FilterSpec[]): string {
  const spec = specFor(specs, row.field)
  if (spec === undefined) return 'Choose a dimension'

  if (row.kind === 'rank') {
    // The label verbatim, not lower-cased: these are engine column names, and
    // "adv 3m" reads as a typo where "Adv 3m" reads as a column.
    const count = row.count ?? 0
    if (count <= 0) return `${row.direction} — by ${spec.label}`
    return `${row.direction} ${count.toLocaleString('en-US')} by ${spec.label}`
  }

  if (spec.kind === 'category') {
    if (row.values.length === 0) return `${spec.label} — nothing chosen`
    return `${spec.label} is ${row.values.join(' or ')}`
  }

  const { min, max } = row
  if (min !== undefined && max !== undefined)
    return `${spec.label} between ${hint(min)} and ${hint(max)}`
  if (min !== undefined) return `${spec.label} at least ${hint(min)}`
  if (max !== undefined) return `${spec.label} at most ${hint(max)}`
  return `${spec.label} — no bound set`
}

/** Compact, because a market cap spelled out does not fit a summary line. */
function hint(value: number): string {
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
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
