import { describe, expect, it } from 'vitest'
import type { Point } from '../../charts/transform'
import { bestOf, metricRows } from './comparison'

function series(values: number[], startYear = 2020): Point[] {
  return values.map((value, index) => ({
    date: `${String(startYear + index)}-01-01`,
    value
  }))
}

/** TECH10 ends far higher but gets there through two real drawdowns. */
const SET = {
  TECH10: series([100, 130, 90, 220, 180, 341]),
  'GLOBAL-EQ': series([100, 108, 118, 130, 145, 160])
}

describe('metricRows', () => {
  it('reports one row per metric, with a column per index', () => {
    const rows = metricRows(SET)

    expect(rows.map((row) => row.metric)).toEqual([
      'Total return · since base',
      'CAGR',
      'Volatility · annualised',
      'Return per unit of vol',
      'Max drawdown'
    ])
    expect(Object.keys(rows[0]?.values ?? {})).toEqual(['TECH10', 'GLOBAL-EQ'])
  })

  it('omits Sharpe, which would need a risk-free rate nothing defines', () => {
    // Silently assuming zero would make two indices look comparable on a
    // number neither the engine nor the design has stated.
    expect(metricRows(SET).some((row) => row.metric.includes('Sharpe'))).toBe(false)
  })

  it('computes total return from the rebased levels compare already sent', () => {
    expect(metricRows(SET)[0]?.values.TECH10).toBeCloseTo(241, 0)
  })

  it('knows that lower volatility is better and higher return is not', () => {
    const rows = metricRows(SET)
    expect(rows.find((row) => row.metric === 'CAGR')?.higherIsBetter).toBe(true)
    expect(rows.find((row) => row.metric.startsWith('Volatility'))?.higherIsBetter).toBe(false)
  })

  it('reports max drawdown as a negative number, never positive', () => {
    const dipped = { A: series([100, 80, 120]) }
    expect(metricRows(dipped)[4]?.values.A).toBeCloseTo(-20, 6)
  })

  it('survives an index with no observations', () => {
    const rows = metricRows({ EMPTY: [] })
    expect(rows[0]?.values.EMPTY).toBeUndefined()
    expect(rows[4]?.values.EMPTY).toBeUndefined()
  })
})

describe('bestOf', () => {
  it('picks the winner in the direction the metric runs', () => {
    const rows = metricRows(SET)
    expect(bestOf(rows[0]!)).toBe('TECH10')
    expect(bestOf(rows.find((row) => row.metric.startsWith('Volatility'))!)).toBe('GLOBAL-EQ')
  })

  it('declares no winner on a tie — equals are not a difference', () => {
    const tied = metricRows({ A: series([100, 200]), B: series([100, 200]) })
    expect(bestOf(tied[0]!)).toBeUndefined()
  })

  it('declares no winner when only one index carries a value', () => {
    const lonely = metricRows({ A: series([100, 200]), B: [] })
    expect(bestOf(lonely[0]!)).toBeUndefined()
  })
})
