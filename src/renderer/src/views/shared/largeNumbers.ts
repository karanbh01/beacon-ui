/**
 * How large numbers read (BU-228): the unit a money amount is shown in, and
 * how many decimals any large number carries. Karan's ask, a global choice
 * under Data → Data Preferences, where every table had its own fixed rule —
 * "bn" in the preview, "3.16T" in the watchlist.
 */

export type LargeUnit = 'auto' | 'thousands' | 'millions' | 'billions' | 'trillions'

export interface NumberPreferences {
  /** What money amounts are shown in. `auto` picks per value, with a suffix. */
  unit: LargeUnit
  /** Decimal places on every large number, money and counts alike. */
  decimals: number
}

/** Billions at whole numbers: what the cap columns showed before the setting. */
export const DEFAULT_NUMBER_PREFERENCES: NumberPreferences = { unit: 'billions', decimals: 0 }

export const LARGE_UNITS: readonly LargeUnit[] = [
  'auto',
  'thousands',
  'millions',
  'billions',
  'trillions'
]

export const MAX_DECIMALS = 4

const SCALE: Record<Exclude<LargeUnit, 'auto'>, number> = {
  thousands: 1e3,
  millions: 1e6,
  billions: 1e9,
  trillions: 1e12
}

/** Finance's own abbreviations, as a header says them: "Market Cap (bn …)". */
const ABBREVIATION: Record<Exclude<LargeUnit, 'auto'>, string> = {
  thousands: 'k',
  millions: 'mn',
  billions: 'bn',
  trillions: 'tn'
}

/** Largest first, so a value takes the biggest suffix it reaches. */
const SUFFIXES: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K']
]

function fixed(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/** A value with the suffix its own size calls for: 3.16e12 → "3.16T". */
function suffixed(value: number, decimals: number): string {
  const magnitude = Math.abs(value)
  for (const [scale, suffix] of SUFFIXES) {
    if (magnitude >= scale) return `${fixed(value / scale, decimals)}${suffix}`
  }
  return fixed(value, decimals)
}

/**
 * A money amount in the chosen unit. A fixed unit leaves the number bare,
 * since the header names the unit once for the whole column; `auto` gives
 * each value its own suffix, as there is no single unit to name.
 */
export function formatMoney(
  value: number | null | undefined,
  preferences: NumberPreferences
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (preferences.unit === 'auto') return suffixed(value, preferences.decimals)
  return fixed(value / SCALE[preferences.unit], preferences.decimals)
}

/**
 * A large count — a volume, an ADV — at the chosen precision. Always its own
 * suffix whatever the money unit: shares traded in "billions" would make a
 * 4.2M ADV read 0.0, which says nothing.
 */
export function formatCount(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return suffixed(value, decimals)
}

/** The unit as a header names it, or nothing under `auto`. */
export function unitAbbreviation(unit: LargeUnit): string | undefined {
  return unit === 'auto' ? undefined : ABBREVIATION[unit]
}

/**
 * A money column's header with the unit in it: "Market Cap (bn Local Ccy)",
 * or "Market Cap (Local Ccy)" under `auto`, where the values carry their own.
 */
export function moneyHeader(label: string, currency: string, unit: LargeUnit): string {
  const abbreviation = unitAbbreviation(unit)
  return abbreviation === undefined
    ? `${label} (${currency})`
    : `${label} (${abbreviation} ${currency})`
}

/** Anything stored that is not a preference falls back, field by field. */
export function sanitisePreferences(raw: unknown): NumberPreferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_NUMBER_PREFERENCES
  const record = raw as Record<string, unknown>
  const unit = LARGE_UNITS.find((candidate) => candidate === record.unit)
  const decimals =
    typeof record.decimals === 'number' &&
    Number.isInteger(record.decimals) &&
    record.decimals >= 0 &&
    record.decimals <= MAX_DECIMALS
      ? record.decimals
      : DEFAULT_NUMBER_PREFERENCES.decimals
  return { unit: unit ?? DEFAULT_NUMBER_PREFERENCES.unit, decimals }
}
