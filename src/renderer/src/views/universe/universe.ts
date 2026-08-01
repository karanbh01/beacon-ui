/**
 * How many members get their reference detail fetched.
 *
 * py-beacon has no batch reference endpoint: Name, GICS Sector and market cap
 * are one call per identifier. A 512-name universe would be 512 requests, so
 * the detail columns are filled for a bounded prefix and the footnote says
 * how many. Issue #45 asks for the batch endpoint that would remove the cap.
 */
export const DETAIL_LIMIT = 60

export interface UniverseRow {
  position: number
  ticker: string
  name: string | undefined
  sector: string | undefined
  marketCap: number | undefined
  /** False past DETAIL_LIMIT — the row is real, its detail was not asked for. */
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

  return {
    position,
    ticker: identifier,
    name: typeof name === 'string' ? name : undefined,
    sector: typeof sector === 'string' ? sector : undefined,
    marketCap: typeof cap === 'number' && Number.isFinite(cap) ? cap : undefined,
    detailed
  }
}

/** 3.16e12 → "3,160" — the design reports market cap in $bn. */
export function billions(value: number | undefined): string {
  if (value === undefined) return '—'
  return Math.round(value / 1e9).toLocaleString('en-US')
}
