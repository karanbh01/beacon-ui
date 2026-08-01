export interface ReferenceRow {
  label: string
  /** Column names py-beacon might carry this fact under, best first. */
  keys: readonly string[]
}

export interface ReferenceCard {
  title: string
  rows: readonly ReferenceRow[]
}

/**
 * The four cards from Figma 234:4680, in frame order.
 *
 * py-beacon returns `fields` as an open dictionary keyed by whatever columns
 * the loaded reference data happens to carry — the library imposes no schema
 * on it — so each row lists the aliases it will answer to instead of naming
 * one column and hoping.
 *
 * A row whose fact is absent renders a dash rather than disappearing. A card
 * that silently shortened would read as "this instrument has fewer
 * identifiers", when the truth is that this engine's reference source does
 * not carry the field.
 */
export const REFERENCE_CARDS: readonly ReferenceCard[] = [
  {
    title: 'Identifiers',
    rows: [
      { label: 'Ticker', keys: ['ticker', 'symbol', 'identifier'] },
      { label: 'Name', keys: ['name', 'long_name', 'longname', 'short_name'] },
      { label: 'ISIN', keys: ['isin'] },
      { label: 'CUSIP', keys: ['cusip'] },
      { label: 'FIGI', keys: ['figi', 'composite_figi'] },
      { label: 'SEDOL', keys: ['sedol'] },
      { label: 'Exchange', keys: ['exchange', 'exchange_name', 'full_exchange_name', 'mic'] },
      { label: 'Currency', keys: ['currency'] },
      { label: 'Country', keys: ['country'] },
      { label: 'Security Type', keys: ['security_type', 'instrument_type', 'quote_type', 'type'] }
    ]
  },
  {
    title: 'Classification',
    rows: [
      { label: 'GICS Sector', keys: ['gics_sector', 'sector'] },
      { label: 'GICS Industry Group', keys: ['gics_industry_group', 'industry_group'] },
      { label: 'GICS Industry', keys: ['gics_industry', 'industry'] },
      { label: 'GICS Sub-Industry', keys: ['gics_sub_industry', 'sub_industry'] },
      { label: 'Beacon Asset Class', keys: ['asset_class', 'beacon_asset_class'] },
      { label: 'Instrument Subtype', keys: ['instrument_subtype', 'subtype'] },
      { label: 'Trading Status', keys: ['trading_status', 'status'] },
      { label: 'Primary Listing', keys: ['primary_listing', 'primary_exchange'] },
      { label: 'ADR / GDR', keys: ['adr', 'depositary_receipt'] },
      { label: 'Options Available', keys: ['options_available', 'has_options'] }
    ]
  },
  {
    title: 'Corporate profile',
    rows: [
      { label: 'Shares Outstanding', keys: ['shares_outstanding'] },
      { label: 'Free Float', keys: ['free_float', 'float_shares'] },
      { label: 'Market Cap', keys: ['market_cap', 'marketcap'] },
      { label: 'Employees', keys: ['employees', 'full_time_employees'] },
      { label: 'Headquarters', keys: ['headquarters', 'city'] },
      { label: 'Founded', keys: ['founded'] },
      { label: 'IPO Date', keys: ['ipo_date', 'first_trade_date'] },
      { label: 'Fiscal Year End', keys: ['fiscal_year_end'] },
      { label: 'Dividend Frequency', keys: ['dividend_frequency'] },
      { label: 'Next Earnings', keys: ['next_earnings', 'earnings_date'] }
    ]
  },
  {
    title: 'Universe membership',
    rows: [
      { label: 'S&P 500', keys: ['sp500', 'in_sp500'] },
      { label: 'NASDAQ-100', keys: ['nasdaq100', 'in_nasdaq100'] },
      { label: 'Dow Jones Industrial Average', keys: ['djia', 'in_djia'] },
      { label: 'MSCI World', keys: ['msci_world', 'in_msci_world'] },
      { label: 'Restricted Lists', keys: ['restricted_lists', 'restricted'] },
      { label: 'Sanctions Flags', keys: ['sanctions_flags', 'sanctioned'] }
    ]
  }
]

/** Every key the cards claim, for the "not shown" count in the footnote. */
export function claimedKeys(): Set<string> {
  const claimed = new Set<string>()
  for (const card of REFERENCE_CARDS) {
    for (const row of card.rows) {
      for (const key of row.keys) claimed.add(key.toLowerCase())
    }
  }
  return claimed
}

/** Case-insensitive index, built once per render rather than per row. */
export function indexFields(fields: Record<string, unknown> | undefined): Map<string, unknown> {
  if (fields === undefined) return new Map()
  return new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]))
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Render the first alias the engine actually carries.
 *
 * Numbers are localised and booleans read as Yes/No, because a reference card
 * is prose about an instrument — `1` under "Options Available" states nothing.
 */
export function readField(index: Map<string, unknown>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = index.get(alias.toLowerCase())
    if (isBlank(value)) continue
    if (typeof value === 'number') return value.toLocaleString('en-US')
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }
  return '—'
}

/**
 * Fields the engine sent that no card claims.
 *
 * Surfaced as a count rather than dropped: reference data is open-ended, and a
 * card set that quietly hides half of what arrived would misrepresent the
 * engine as knowing less than it does.
 */
export function unclaimedCount(fields: Record<string, unknown> | undefined): number {
  if (fields === undefined) return 0
  const claimed = claimedKeys()
  return Object.entries(fields).filter(
    ([key, value]) => !claimed.has(key.toLowerCase()) && !isBlank(value)
  ).length
}
