/**
 * Reference columns on holding rows, as py-beacon 0.9.2 serves them (BN-325).
 *
 * `reference_fields` names the columns, case-insensitive. Omitted, a row
 * carries the default four; empty, none. A column that says what a series
 * is answers as the engine reads it even where the data has no such column
 * (a missing ASSET_CLASS is "Equity"); the descriptive ones answer null;
 * any other unknown name is refused whole, as `/data/reference` refuses.
 */

/** Name, asset class, sector, then the dataset's country column. */
export const DEFAULT_REFERENCE_FIELDS = ['name', 'asset_class', 'sector', 'country_domicile']

/** Answered as the engine reads them, whether or not the data carries them. */
const READ_BY_THE_ENGINE: Record<string, unknown> = {
  asset_class: 'Equity',
  security_type: 'Common Stock',
  tradable: true
}

/** Answered null where the data lacks them, rather than refused. */
const DESCRIPTIVE = [
  'sector',
  'industry',
  'sub_industry',
  'region',
  'country',
  'country_domicile',
  'country_listing'
]

/** What a request asked for, or the columns it named that no dataset holds. */
export type AskedFields = { fields: string[] } | { unknown: string[] }

/**
 * The columns a request asks for. `stored` is the dataset's own columns,
 * upper-case as the stub declares them.
 */
export function askedFields(url: URL, stored: readonly string[]): AskedFields {
  const raw = url.searchParams.get('reference_fields')
  if (raw === null) return { fields: DEFAULT_REFERENCE_FIELDS }

  const fields = raw
    .split(',')
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field !== '')
  const known = new Set([
    ...stored.map((column) => column.toLowerCase()),
    ...Object.keys(READ_BY_THE_ENGINE),
    ...DESCRIPTIVE
  ])
  const unknown = fields.filter((field) => !known.has(field))
  return unknown.length > 0 ? { unknown } : { fields }
}

/**
 * One row's reference: the asked columns from the name's reference row,
 * keyed in lower case. Null when the name had no reference row then.
 */
export function referenceFor(
  fields: readonly string[],
  row: Readonly<Record<string, unknown>> | null
): Record<string, unknown> | null {
  if (row === null) return null
  const lower = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]))
  return Object.fromEntries(
    fields.map((field) => [field, lower.get(field) ?? READ_BY_THE_ENGINE[field] ?? null])
  )
}

/** Each identifier's reference, for a map of weights (a rebalance, a frontier). */
export function referenceMap(
  fields: readonly string[],
  identifiers: readonly string[],
  rowOf: (identifier: string) => Readonly<Record<string, unknown>> | null
): Record<string, Record<string, unknown> | null> | null {
  if (fields.length === 0) return null
  return Object.fromEntries(
    identifiers.map((identifier) => [identifier, referenceFor(fields, rowOf(identifier))])
  )
}

/** py-beacon's labels for a column chooser (beacon/expressions/catalogue.py). */
const LABELS: Record<string, string> = {
  asset_class: 'Asset class',
  security_type: 'Security type',
  base_currency: 'Base currency',
  quote_currency: 'Quote currency',
  day_count: 'Day count',
  date_from: 'Valid from',
  date_to: 'Valid to',
  sub_industry: 'Sub-industry',
  country_domicile: 'Country of domicile',
  country_listing: 'Country of listing',
  shares_outstanding: 'Shares outstanding',
  free_float: 'Free float'
}

/** Kept in capitals wherever they fall in a name (py-beacon 0.9.3, BN-327). */
const ACRONYMS = new Set([
  'adr',
  'adv',
  'cusip',
  'etf',
  'figi',
  'gics',
  'icb',
  'id',
  'ipo',
  'isin',
  'lei',
  'mic',
  'nav',
  'ric',
  'sedol',
  'trbc',
  'usd',
  'eur',
  'gbp',
  'jpy'
])

/** A field's label: its own where it has one, else its name in words. */
export function labelOf(name: string): string {
  const own = LABELS[name]
  if (own !== undefined) return own
  const words = name
    .split('_')
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word))
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
