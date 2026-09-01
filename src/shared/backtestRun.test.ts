import { describe, expect, it } from 'vitest'
import { parseRun } from './backtestRun'

/**
 * The one payload in the app described by hand rather than generated
 * (BU-137), so its reading is worth pinning: `JobStatus.result` has no schema
 * in the contract, and a job of another kind lands in the same field.
 */
const RUN = {
  level: { index: ['2025-01-02T00:00:00', '2025-01-03T00:00:00'], data: [100, 101.2] },
  index_level: { index: ['2025-01-02T00:00:00', '2025-01-03T00:00:00'], data: [100, 101.4] },
  drawdown: { index: ['2025-01-02T00:00:00'], data: [0] },
  annual_returns: { '2025': 0.1042 },
  metrics: { total_return: 0.17, sharpe_ratio: 0.88, tracking_error: 0.0019 },
  benchmark: null,
  total_costs: 8412.5,
  initial_capital: 1_000_000
}

describe('parseRun', () => {
  it('reads the tracked index from index_level, which was benchmark_level', () => {
    // BN-155 renamed it: the series is the index the portfolio tracked, and
    // the old name claimed the benchmark of record instead.
    const run = parseRun(RUN)

    expect(run?.indexLevel.data).toEqual([100, 101.4])
    expect(run?.level.data).toEqual([100, 101.2])
  })

  it('keeps "not measured" apart from measured', () => {
    // A run given no benchmark comes back null. Undefined here means the
    // question was never asked, which the view says out loud rather than
    // reporting a dash that reads as a measurement of nothing.
    expect(parseRun(RUN)?.benchmark).toBeUndefined()
    expect(parseRun({ ...RUN, benchmark: { tracking_error: 0.02 } })?.benchmark).toEqual(
      expect.objectContaining({ tracking_error: 0.02 })
    )
  })

  it('opens on the first trading day, with no day-zero row', () => {
    // Verified against py-beacon d92e182: `level` and `index_level` are
    // rebased trading-day series. Day zero belongs to `portfolio.nav` in the
    // record payload, which has no route — so nothing is dropped here.
    expect(parseRun(RUN)?.level.index[0]).toBe('2025-01-02T00:00:00')
  })

  it('refuses anything that is not a backtest result', () => {
    // One registry carries every kind of job, so this field can hold a sync
    // report or an optimisation — the pane must stay empty, not fall over.
    expect(parseRun(undefined)).toBeUndefined()
    expect(parseRun({ synced: 4 })).toBeUndefined()
    expect(parseRun({ level: RUN.level })).toBeUndefined()
  })

  it('drops values that are not finite numbers rather than plotting them', () => {
    const messy = { ...RUN, level: { index: ['a', 'b'], data: ['x', Number.NaN] } }
    expect(parseRun(messy)?.level.data).toEqual([null, null])
  })
})
