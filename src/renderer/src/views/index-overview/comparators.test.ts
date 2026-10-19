import { describe, expect, it } from 'vitest'
import type { RunResult } from '../shared/beaconQueries'
import { comparatorsOf } from './comparators'
import { summaryRows } from './summaryRows'

const own = {
  total_return: 0.04,
  annualised_return: 0.02,
  volatility: 0.1,
  sharpe_ratio: 0.2,
  max_drawdown: -0.05,
  hit_rate_monthly: 0.5
}
const relative = {
  relative_return: 0.02,
  annualised_relative_return: 0.01,
  tracking_error: 0.03,
  information_ratio: 0.33,
  correlation: 0.9,
  beta: 1.1,
  hit_rate_monthly: 0.6
}

function comparison(id: string): unknown {
  return {
    id,
    kind: 'index',
    start: '2024-01-01',
    end: '2024-01-04',
    observations: 4,
    level: { name: id, index: ['2024-01-01T00:00:00'], data: [100] },
    own,
    relative
  }
}

function run(kind: string, benchmark: boolean): RunResult {
  return {
    comparisons: {
      index: comparison('TECH10'),
      benchmark: benchmark ? comparison('EU-VALUE') : null
    },
    settings: { strategy: { type: kind } }
  } as unknown as RunResult
}

describe('what a strategy is compared with (Karan, 2026-10-18)', () => {
  it('measures the index as defined against its index, and a benchmark when it had one', () => {
    const plain = comparatorsOf(run('index', false))
    expect(plain.index?.id).toBe('TECH10')
    expect(plain.benchmark).toBeUndefined()

    const benchmarked = comparatorsOf(run('index_tracking', true))
    expect(benchmarked.index?.id).toBe('TECH10')
    expect(benchmarked.benchmark?.id).toBe('EU-VALUE')
  })

  it('measures an active strategy against a benchmark only', () => {
    // Its external benchmark when it names one, else the index it is built on.
    expect(comparatorsOf(run('active', true))).toMatchObject({
      index: undefined,
      benchmark: { id: 'EU-VALUE' }
    })
    expect(comparatorsOf(run('active', false))).toMatchObject({
      index: undefined,
      benchmark: { id: 'TECH10' }
    })
  })

  it('shows the engine’s figures, and only those (BN-323)', () => {
    const metrics = { total_return: 0.06, volatility: 0.12 } as Parameters<typeof summaryRows>[0]
    const rows = summaryRows(metrics, comparatorsOf(run('index', true)))

    expect(rows.find((row) => row.key === 'return')).toMatchObject({
      strategy: '+6.00%',
      index: '+4.00%',
      vsIndex: '+2.00%',
      benchmark: '+4.00%',
      vsBenchmark: '+2.00%'
    })
    // No relative volatility from the engine, so none is made up here.
    expect(rows.find((row) => row.key === 'volatility')?.vsIndex).toBe('—')
    expect(rows.find((row) => row.key === 'information')?.vsBenchmark).toBe('0.33')
  })
})
