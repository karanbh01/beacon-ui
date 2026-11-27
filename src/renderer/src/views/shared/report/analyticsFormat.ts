import type { AnalysisOptions, StatisticSpec, Unit } from '../../../api/analytics'

/**
 * A figure in the unit and to the decimals the catalogue gives it (BN-400):
 * a fraction as a percent, money with its separators, a count whole. The
 * catalogue's decimals for a fraction are of the fraction, so 4 is two
 * places of a percent.
 */
export function formatValue(value: unknown, unit: Unit | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  if (typeof value !== 'number') return '—'
  if (!Number.isFinite(value)) return '—'
  switch (unit) {
    case 'fraction':
      return `${(value * 100).toFixed(Math.max(0, decimals - 2))}%`
    case 'bps':
      return `${value.toFixed(decimals)} bps`
    case 'money':
      return value.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })
    case 'count':
      return Math.round(value).toLocaleString('en-GB')
    case 'days':
      return `${Math.round(value).toLocaleString('en-GB')} days`
    case 'years':
      return `${value.toFixed(decimals)} years`
    default:
      return value.toFixed(decimals)
  }
}

/** Positive green, negative red, for returns and differences only. */
export function toneOf(
  value: unknown,
  unit: Unit | null | undefined
): 'positive' | 'negative' | '' {
  if (typeof value !== 'number' || unit !== 'fraction' || value === 0) return ''
  return value > 0 ? 'positive' : 'negative'
}

/*
 * Which statistics are returns or differences, and so coloured by sign. A
 * volatility or a weight is never "good" for being positive. The catalogue
 * does not say yet; asked of py-beacon as a `signed` flag.
 */
const SIGNED_CATEGORIES = new Set(['Returns', 'Crises and regimes', 'Attribution'])
const SIGNED_IDS = new Set([
  'tracking_difference',
  'relative_return',
  'td_by_year',
  'stress_windows',
  'relative_drawdowns',
  'drawdown_episodes'
])

export function isSigned(statistic: StatisticSpec): boolean {
  return SIGNED_CATEGORIES.has(statistic.category) || SIGNED_IDS.has(statistic.id)
}

/**
 * A figure's name in words: a portfolio ("Fund"), or a compound name labelled
 * part by part through the dimensions the statistic declares, so
 * "historical/0.95/1" reads "Historical, 95%, 1 day" (BN-400).
 */
/**
 * A portfolio's name in words ("Fund"). py-beacon 0.11.0 calls the
 * dimension `portfolio`; an engine before it, `book` (BN-463).
 */
export function portfolioName(name: string, names: AnalysisOptions['names'] | undefined): string {
  return names?.portfolio?.[name] ?? names?.book?.[name] ?? name
}

export function figureLabel(
  name: string,
  statistic: StatisticSpec,
  names: AnalysisOptions['names']
): string {
  const dimensions = statistic.figure_names
  if (dimensions === undefined) return portfolioName(name, names)
  const parts = name.split('/')
  return parts.map((part, at) => names[dimensions[at] ?? '']?.[part] ?? part).join(', ')
}
