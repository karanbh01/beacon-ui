import { describe, expect, it } from 'vitest'
import {
  activeAgainst,
  aggregateBy,
  columnTotals,
  fromPanel,
  fromSnapshots,
  type RebalanceSnapshot,
  type TableFrame
} from './weightsHistory'

const SNAPSHOTS: RebalanceSnapshot[] = [
  { date: '2025-03-21', redistributed: 0, weights: { AAA: 0.6, BBB: 0.4 } },
  { date: '2025-06-20', redistributed: 0, weights: { AAA: 0.5, CCC: 0.5 } }
]

/** Dates by identifier, as py-beacon sends a weights panel. */
const PANEL: TableFrame = {
  index: [
    '2025-01-30T00:00:00',
    '2025-01-31T00:00:00',
    '2025-02-27T00:00:00',
    '2025-02-28T00:00:00',
    '2025-03-31T00:00:00'
  ],
  columns: ['AAA', 'BBB'],
  data: [
    [0.5, 0.5],
    [0.52, 0.48],
    [0.55, 0.45],
    [0.54, 0.46],
    [0.6, null]
  ]
}

describe('by rebalance (BU-177)', () => {
  it('puts names down and dates across, oldest column first', () => {
    const matrix = fromSnapshots(SNAPSHOTS, 2)

    expect(matrix.dates).toEqual(['2025-03-21', '2025-06-20'])
    expect(matrix.rows.map((row) => row.key)).toContain('CCC')
    expect(matrix.rows).toHaveLength(3)
  })

  it('leaves a name absent rather than holding it at zero', () => {
    // "Not in the index" and "in the index at 0.00%" are different facts,
    // and a zero would lose the difference.
    const matrix = fromSnapshots(SNAPSHOTS, 2)
    const bbb = matrix.rows.find((row) => row.key === 'BBB')

    expect(bbb?.cells[0]).toBeCloseTo(0.4, 10)
    expect(bbb?.cells[1]).toBeUndefined()
  })

  it('sorts the heaviest holding to the top', () => {
    expect(fromSnapshots(SNAPSHOTS, 2).rows[0]?.key).toBe('AAA')
  })

  it('says when the engine served fewer rows than it holds', () => {
    // The list is bounded to its most recent entries and the failure mode is
    // quiet: a table that simply starts late.
    expect(fromSnapshots(SNAPSHOTS, 90).truncation).toEqual({ served: 2, total: 90 })
    expect(fromSnapshots(SNAPSHOTS, 2).truncation).toBeUndefined()
  })

  it('orders columns by date, whatever order they arrived in', () => {
    const shuffled = [...SNAPSHOTS].reverse()
    expect(fromSnapshots(shuffled, 2).dates).toEqual(['2025-03-21', '2025-06-20'])
  })
})

describe('resampling the daily panel (BU-177)', () => {
  it('takes the LAST date in each bucket, which is what a month end means', () => {
    const matrix = fromPanel(PANEL, 5, 'monthly')

    expect(matrix.dates).toEqual(['2025-01-31', '2025-02-28', '2025-03-31'])
    // 0.52 is the 31st, not the 30th: taking the first would report what was
    // held before the month's trading rather than after it.
    expect(matrix.rows.find((row) => row.key === 'AAA')?.cells[0]).toBeCloseTo(0.52, 10)
  })

  it('collapses a quarter to its last observation', () => {
    expect(fromPanel(PANEL, 5, 'quarterly').dates).toEqual(['2025-03-31'])
  })

  it('reads a null cell as not held', () => {
    // NaN arrives as null in a TableFrame; a zero here would say the index
    // held the name at nothing rather than not at all.
    const matrix = fromPanel(PANEL, 5, 'monthly')
    expect(matrix.rows.find((row) => row.key === 'BBB')?.cells[2]).toBeUndefined()
  })

  it('survives a panel that never arrived', () => {
    expect(fromPanel(undefined, 0, 'monthly').rows).toEqual([])
  })
})

describe('aggregation (BU-177)', () => {
  const sectors: Record<string, string> = { AAA: 'Tech', BBB: 'Tech', CCC: 'Energy' }

  it('sums members into their group and preserves the column totals', () => {
    const matrix = fromSnapshots(SNAPSHOTS, 2)
    const rolled = aggregateBy(matrix, (name) => sectors[name] ?? 'Unclassified')

    expect(rolled.rows.map((row) => row.key).sort()).toEqual(['Energy', 'Tech'])
    // An aggregation that changed the totals would be a different index.
    expect(columnTotals(rolled)[0]).toBeCloseTo(1, 10)
    expect(columnTotals(rolled)[1]).toBeCloseTo(1, 10)
  })

  it('keeps a name the reference data cannot classify', () => {
    // Dropping it would change the total and hide the gap that caused it.
    const rolled = aggregateBy(fromSnapshots(SNAPSHOTS, 2), (name) =>
      name === 'CCC' ? 'Unclassified' : 'Tech'
    )
    expect(rolled.rows.map((row) => row.key)).toContain('Unclassified')
    expect(columnTotals(rolled)[1]).toBeCloseTo(1, 10)
  })

  it('leaves a group absent on a date where none of its members were held', () => {
    const rolled = aggregateBy(fromSnapshots(SNAPSHOTS, 2), (name) => sectors[name] ?? '—')
    const energy = rolled.rows.find((row) => row.key === 'Energy')

    expect(energy?.cells[0]).toBeUndefined()
    expect(energy?.cells[1]).toBeCloseTo(0.5, 10)
  })
})

describe('active weights (BU-177)', () => {
  const index = fromSnapshots(SNAPSHOTS, 2)
  const benchmark = fromSnapshots(
    [
      { date: '2025-03-21', redistributed: 0, weights: { AAA: 0.5, DDD: 0.5 } },
      { date: '2025-06-20', redistributed: 0, weights: { AAA: 0.5, DDD: 0.5 } }
    ],
    2
  )

  it('subtracts the benchmark and keeps the sign', () => {
    const active = activeAgainst(index, benchmark)
    expect(active.rows.find((row) => row.key === 'AAA')?.cells[0]).toBeCloseTo(0.1, 10)
    expect(active.rows.find((row) => row.key === 'AAA')?.cells[1]).toBeCloseTo(0, 10)
  })

  it('counts a name only the benchmark holds as a real underweight', () => {
    /*
     * The opposite of the absence rule elsewhere, and deliberately: an
     * active weight asks "how much more of this than the benchmark", so
     * holding none of something the benchmark holds is a position, not a
     * blank.
     */
    const active = activeAgainst(index, benchmark)
    expect(active.rows.find((row) => row.key === 'DDD')?.cells[0]).toBeCloseTo(-0.5, 10)
  })

  it('sums to zero across names when both sides are fully invested', () => {
    const active = activeAgainst(index, benchmark)
    expect(columnTotals(active)[0]).toBeCloseTo(0, 10)
  })

  it('reports nothing on a date the benchmark does not cover', () => {
    // The index's own weight is not an active weight, and showing it as one
    // would overstate every position by the benchmark's.
    const short = fromSnapshots([{ date: '2025-06-20', redistributed: 0, weights: { AAA: 1 } }], 1)
    const active = activeAgainst(index, short)

    expect(active.rows.every((row) => row.cells[0] === undefined)).toBe(true)
  })
})
