import { describe, expect, it } from 'vitest'
import type { components } from '@shared/api.generated'
import type { Comparators } from './comparators'
import { performanceMatrix } from './performanceMatrix'

type PeriodRow = components['schemas']['PeriodRow']

const alone: Comparators = {
  kind: 'index',
  index: undefined,
  benchmark: undefined,
  benchmarkIsIndex: false
}

const metrics = {
  total_return: 0.3,
  annualised_return: 0.09,
  volatility: 0.2,
  sharpe_ratio: 0.45,
  max_drawdown: -0.3,
  calmar_ratio: 0.3
} as unknown as components['schemas']['BacktestMetrics']

// The annual rates sit beside the schema's figures, as the stub serves them.
function window(period: string, start: string, end: string): PeriodRow {
  return {
    period,
    start,
    end,
    strategy: {
      total_return: 0.05,
      volatility: 0.2,
      sharpe_ratio: 0.5,
      max_drawdown: -0.1,
      positive_days: 0.52,
      annualised_return: 0.1,
      calmar_ratio: 1
    } as PeriodRow['strategy']
  }
}

const periods = [
  window('6M', '2024-07-22', '2025-01-22'),
  window('1Y', '2024-01-22', '2025-01-22'),
  window('3Y', '2022-01-21', '2025-01-22')
]

function columnsOf(key: string, frequency: 'trailing' | 'annual'): string[] {
  const row = performanceMatrix(metrics, alone, periods, frequency).rows.find(
    (each) => each.key === key
  )
  return Object.keys(row?.values ?? {})
}

describe('performanceMatrix', () => {
  it('gives an annual rate since inception and in trailing windows of a year or more', () => {
    expect(columnsOf('annualised', 'trailing')).toEqual(['since', '1Y', '3Y'])
    expect(columnsOf('calmar', 'trailing')).toEqual(['since', '1Y', '3Y'])
  })

  it('gives a calendar period no annual rate', () => {
    expect(columnsOf('annualised', 'annual')).toEqual(['since'])
  })

  it('gives every window its total return', () => {
    expect(columnsOf('return', 'trailing')).toEqual(['since', '6M', '1Y', '3Y'])
  })
})
