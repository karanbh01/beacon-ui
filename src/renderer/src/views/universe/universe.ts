export interface UniverseRow {
  position: number
  ticker: string
  name: string | undefined
  sector: string | undefined
  marketCap: number | undefined
  /** Average daily volume over three months, a derived reference field. */
  adv: number | undefined
  /**
   * Whether the engine had a reference row for this identifier.
   *
   * Used to be "was its detail requested" — the table fetched one call per
   * name and stopped at 60. The batch endpoint (#45) removed that cap, so a
   * blank row now means the engine has nothing for it, which is a fact about
   * the data rather than about how the client chose to ask.
   */
  detailed: boolean
}

function read(fields: Record<string, unknown> | undefined, aliases: readonly string[]): unknown {
  if (fields === undefined) return undefined
  const index = new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]))
  for (const alias of aliases) {
    const value = index.get(alias)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function buildRow(
  identifier: string,
  position: number,
  fields: Record<string, unknown> | undefined,
  detailed: boolean
): UniverseRow {
  const name = read(fields, ['name', 'long_name', 'longname', 'short_name'])
  const sector = read(fields, ['gics_sector', 'sector'])
  const cap = read(fields, ['free_float_market_cap', 'market_cap', 'marketcap'])
  const adv = read(fields, ['adv_3m', 'adv3m', 'average_daily_volume'])
  const numeric = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  return {
    position,
    ticker: identifier,
    name: typeof name === 'string' ? name : undefined,
    sector: typeof sector === 'string' ? sector : undefined,
    marketCap: numeric(cap),
    adv: numeric(adv),
    detailed
  }
}

/** 4_182_000 → "4.2M". ADV is read as an order of magnitude, not a count. */
export function volume(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(Math.round(value))
}

/** identifier → its reference fields, from a batch response. */
export function fieldsByIdentifier(
  entries: readonly {
    identifier: string
    found: boolean
    fields?: Record<string, unknown> | null
  }[]
): Map<string, Record<string, unknown> | undefined> {
  return new Map(
    entries.map((entry) => [
      entry.identifier,
      entry.found ? (entry.fields ?? undefined) : undefined
    ])
  )
}

/** 3.16e12 → "3,160" — the design reports market cap in $bn. */
export function billions(value: number | undefined): string {
  if (value === undefined) return '—'
  return Math.round(value / 1e9).toLocaleString('en-US')
}
