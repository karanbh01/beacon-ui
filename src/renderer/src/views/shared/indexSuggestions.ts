import type { components } from '@shared/api.generated'
import type { Suggestion } from '../../components/TickerField/suggestions'
import { relativeTime } from '../home/activityRows'

export type BacktestRecordRow = components['schemas']['BacktestRecordRow']

/**
 * The index catalogue, saying which of it has been back-tested (BU-168).
 *
 * One row per index rather than a second row per record: `/beacon/backtests`
 * answers "which indices HAVE a record, and when" (BN-162), and a separate
 * "backtest" row in the bar would promise a payload the pane does not draw —
 * the run itself lives behind `/beacon/{index_id}/record`, which nothing
 * reads yet.
 *
 * The date is what makes the row worth having. "Backtested" alone says only
 * that someone once did; "3d ago" is the difference between a result worth
 * opening and one that predates the definition it came from.
 */
export function withBacktests(
  rows: readonly Suggestion[],
  records: readonly BacktestRecordRow[],
  now: number
): Suggestion[] {
  if (records.length === 0) return [...rows]

  const when = new Map(records.map((record) => [record.index_id, record.run_at]))

  return rows.map((row) => {
    if (!when.has(row.identifier)) return row
    const note = describeRun(when.get(row.identifier) ?? null, now)
    return { ...row, name: row.name === undefined ? note : `${row.name} · ${note}` }
  })
}

/**
 * A record's age, or the fact that it has none.
 *
 * `run_at` is null on records written before py-beacon stamped them (BN-162).
 * "backtested" without a date is the honest reading of that — a re-run stamps
 * one, and inventing a time from the file would be a guess dressed as data.
 */
function describeRun(runAt: string | null, now: number): string {
  if (runAt === null) return 'backtested'

  const at = Date.parse(runAt)
  return Number.isNaN(at) ? 'backtested' : `backtested ${relativeTime(at, now)}`
}
