import type { AssetView } from '../shared/beaconQueries'
import { dayOf, MONTHS, type Cell, type Part } from './profile'

/*
 * Reading the profile's `return_risk` part (py-beacon BN-477) into the
 * spans Summary's table shows: the run, then the periods of one cut.
 */

/** The portfolios in the order the Overview's tables put them; any other after them. */
const ORDER = ['fund', 'index', 'optimised', 'benchmark']

/** How the run is cut into periods, by the part's `period` code (Karan, 2026-11-27). */
export type Cut = 'rebalance' | 'year' | 'quarter' | 'month'

export const CUTS: readonly { value: Cut; label: string }[] = [
  { value: 'rebalance', label: 'Rebalance' },
  { value: 'year', label: 'Annual' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'month', label: 'Monthly' }
]

/** One group of columns: the run, or one period. */
export interface Span {
  key: string
  label: string
  /** How the span's first and last days read in a range of spans: "29 Aug 25", or "2025" for a year. */
  ends: readonly [string, string]
  values: Record<string, Cell>
}

/**
 * The run's span from the profile's `return_risk` part, and one cut's
 * periods, oldest first as the Overview's Performance table has them.
 */
export function spansOf(
  part: Part | undefined,
  cut: Cut
): { run: Span | undefined; periods: Span[] } {
  const run = part?.rows.find((row) => row.values.period === 'run')
  return {
    run:
      run === undefined
        ? undefined
        : { key: 'run', label: RUN, ends: [RUN, RUN], values: run.values },
    periods: (part?.rows ?? [])
      .filter((row) => row.values.period === cut)
      .map((row) => {
        const ends = endsOf(cut, row.date)
        return {
          key: row.date,
          label: ends[0],
          ends,
          values: row.values
        }
      })
  }
}

/**
 * What the run's span is called over its columns (Karan, 2026-11-27): the
 * days every period covers, which claims nothing about whether the name was
 * held throughout, as a name can be dropped and added back.
 */
const RUN = 'All periods'

/** The portfolios a part has figures against, in the Overview's order. */
export function portfoliosOf(part: Part | undefined): string[] {
  const named = new Set(
    (part?.columns ?? []).flatMap((column) => {
      const [, portfolio] = column.name.split('/')
      return portfolio === undefined ? [] : [portfolio]
    })
  )
  return [...named].sort((one, two) => rank(one) - rank(two))
}

const rank = (portfolio: string): number => {
  const at = ORDER.indexOf(portfolio)
  return at === -1 ? ORDER.length : at
}

/**
 * Before the engine has `return_risk`: the run alone, from the asset view,
 * whose figures are the name against the one comparator it tracks.
 */
export function spanOfAsset(asset: AssetView, comparator: string): Span {
  return {
    key: 'run',
    label: RUN,
    ends: [RUN, RUN],
    values: {
      return: asset.total_return ?? null,
      [`excess_return/${comparator}`]: asset.excess_return ?? null,
      [`beta/${comparator}`]: asset.beta ?? null,
      [`correlation/${comparator}`]: asset.correlation ?? null
    }
  }
}

const dateOf = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

/**
 * A period's first and last days as its name reads them: a rebalance
 * period by its last day alone, the rebalance that closes it (Karan,
 * 2026-11-27), and a calendar one as the Overview names them, "2025",
 * "2025 Q3" or "Sep 2025". Each is named once, so a range of them reads
 * from the first's name to the last's.
 */
function endsOf(cut: Cut, end: string): [string, string] {
  const last = dateOf(end)
  if (Number.isNaN(last.getTime())) return [end, end]
  const named = calendarName(cut, last) ?? dayOf(end)
  return [named, named]
}

function calendarName(cut: Cut, last: Date): string | undefined {
  const year = String(last.getUTCFullYear())
  if (cut === 'year') return year
  if (cut === 'quarter') return `${year} Q${String(Math.floor(last.getUTCMonth() / 3) + 1)}`
  if (cut === 'month') return `${MONTHS[last.getUTCMonth()] ?? ''} ${year}`
  return undefined
}
