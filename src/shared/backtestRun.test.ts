import { describe, expect, it } from 'vitest'
import { parseRecord, parseRun } from './backtestRun'

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

describe('parseRecord (BU-169)', () => {
  /** What `/beacon/{index_id}/record` returns after BN-164's reshape. */
  const RECORD = {
    run_at: '2026-09-04T09:00:00Z',
    portfolio: {
      portfolio_id: 'TECH10',
      initial_capital: 1_000_000,
      // Day zero first: the capital before anything traded.
      nav: {
        index: ['2024-12-31', '2025-01-02', '2025-01-03'],
        data: [1_000_000, 1_010_000, 990_000]
      },
      cash: { index: [], data: [] },
      weights: { index: [], columns: [], data: [] },
      weights_dates_total: 0,
      positions: { index: [], columns: [], data: [] },
      positions_total: 0,
      transactions: { index: [], columns: [], data: [] }
    },
    index: {
      target: {
        levels: { index: ['2025-01-02', '2025-01-03'], data: [200, 202] },
        weights: { index: [], columns: [], data: [] },
        weights_dates_total: 0
      },
      optimised: null
    },
    benchmark: null,
    unfilled: [],
    metrics: {
      total_return: -0.01,
      annualised_return: -0.4,
      volatility: 0.2,
      sharpe_ratio: -1.9,
      max_drawdown: -0.02
    }
  }

  it('rebases the portfolio NAV, so a run looks the same wherever it was read', () => {
    const run = parseRecord(RECORD)

    // 100 is the starting capital here, since the record opens on day zero.
    expect(run?.level.data).toEqual([100, 101, 99])
    expect(run?.initialCapital).toBe(1_000_000)
  })

  it('rebases the tracked index onto the same scale', () => {
    // Stored in points rather than currency, and still rebased: the chart
    // draws the two together and they have to share an axis.
    expect(parseRecord(RECORD)?.indexLevel.data).toEqual([100, 101])
  })

  it('reads the tracked book from the container, not from the container', () => {
    // `index` is never null; `index.target` is the one that can be (BN-164).
    const passive = { ...RECORD, index: { target: null, optimised: null } }
    expect(parseRecord(passive)?.indexLevel).toEqual({ index: [], data: [] })
  })

  it('leaves drawdown and calendar returns to the pane, which derives them', () => {
    const run = parseRecord(RECORD)

    expect(run?.drawdown).toEqual({ index: [], data: [] })
    expect(run?.annualReturns).toEqual({})
  })

  it('says not measured when the record kept no comparator', () => {
    expect(parseRecord(RECORD)?.benchmark).toBeUndefined()
  })

  it('reports a comparison when there was one to store', () => {
    const measured = {
      ...RECORD,
      benchmark: {
        levels: { index: [], data: [] },
        weights: { index: [], columns: [], data: [] },
        weights_dates_total: 0
      }
    }

    expect(parseRecord(measured)?.benchmark).toBeDefined()
  })

  it('is not a record at all without a portfolio', () => {
    expect(parseRecord({ metrics: {} })).toBeUndefined()
    expect(parseRecord(undefined)).toBeUndefined()
  })
})
