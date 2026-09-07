import { describe, expect, it } from 'vitest'
import {
  CELL_GLYPH,
  cellState,
  describeRoom,
  oneWayTurnover,
  percent,
  solveOf,
  solveRows,
  sortAssets,
  summarise,
  summariseSolve,
  waterfallColumns,
  type PreviewAsset,
  type PreviewResponse,
  type PreviewSolve,
  type PreviewStep
} from './derivation'

const STEPS: PreviewStep[] = [
  { position: 0, remaining: 512 },
  { position: 1, rule_id: 'r1', rule_type: 'FilterRule', remaining: 87 },
  { position: 2, rule_id: 'r2', rule_type: 'SelectionRule', remaining: 10 }
]

const KEPT: PreviewAsset = {
  identifier: 'NVDA',
  included: true,
  capped: true,
  weight: 0.2,
  uncapped_weight: 0.3153
}
const CUT_EARLY: PreviewAsset = {
  identifier: 'GOOGL',
  included: false,
  capped: false,
  excluded_at: 1,
  excluded_by: 'r1'
}

describe('waterfallColumns', () => {
  it('gives one column per rule and none for the universe', () => {
    // Position 0 is the row count, not a test — every listed name passed it.
    expect(waterfallColumns(STEPS).map((column) => column.header)).toEqual([
      '01 · FilterRule',
      '02 · SelectionRule'
    ])
  })

  it('still produces a column for a step with no rule id', () => {
    expect(waterfallColumns([{ position: 1, remaining: 5 }])[0]?.key).toBe('step-1')
  })
})

describe('cellState', () => {
  it('separates "cut here" from "already gone"', () => {
    // Collapsing them would make an excluded name look rejected by every
    // rule after the one that actually dropped it.
    expect(cellState(CUT_EARLY, 1)).toBe('cut')
    expect(cellState(CUT_EARLY, 2)).toBe('gone')
  })

  it('passes a name that survived the whole pipeline', () => {
    expect(cellState(KEPT, 1)).toBe('pass')
    expect(cellState(KEPT, 2)).toBe('pass')
  })

  it('passes a name at any step before the one that cut it', () => {
    const later: PreviewAsset = { identifier: 'X', included: false, capped: false, excluded_at: 2 }
    expect(cellState(later, 1)).toBe('pass')
  })

  it('has a glyph for each state', () => {
    expect(Object.keys(CELL_GLYPH).sort()).toEqual(['cut', 'gone', 'pass'])
  })
})

describe('sortAssets', () => {
  it('puts the index first, then the names that did not make it', () => {
    const sorted = sortAssets([CUT_EARLY, KEPT])
    expect(sorted.map((asset) => asset.identifier)).toEqual(['NVDA', 'GOOGL'])
  })

  it('does not mutate its input', () => {
    const input = [CUT_EARLY, KEPT]
    sortAssets(input)
    expect(input[0]).toBe(CUT_EARLY)
  })
})

describe('oneWayTurnover', () => {
  it('halves the absolute weight change — a swap is one trade, not two', () => {
    expect(oneWayTurnover({ A: 0.5, B: 0.5 }, { A: 0.6, B: 0.4 })).toBeCloseTo(0.1, 6)
  })

  it('counts a name entering or leaving in full', () => {
    expect(oneWayTurnover({ A: 1 }, { B: 1 })).toBeCloseTo(1, 6)
  })

  it('is zero for an unchanged index', () => {
    expect(oneWayTurnover({ A: 0.5, B: 0.5 }, { A: 0.5, B: 0.5 })).toBe(0)
  })
})

describe('summarise', () => {
  const preview = {
    index_id: 'TECH10',
    as_of: '2026-07-22',
    assets: [KEPT, CUT_EARLY],
    steps: STEPS,
    weights: { NVDA: 0.2 },
    total_weight: 1,
    cap: 0.2,
    cap_redistributed: 0.031
  } as PreviewResponse

  it('counts only what reached the index', () => {
    expect(summarise(preview).constituents).toBe(1)
    expect(summarise(preview).capped).toBe(1)
  })

  it('reports uncapped as null rather than zero', () => {
    // Zero would read as "capped at 0%", which is a very different index.
    expect(summarise({ ...preview, cap: null }).cap).toBeNull()
  })
})

describe('percent', () => {
  it('renders py-beacon fractions', () => {
    expect(percent(0.2)).toBe('20.00%')
    expect(percent(null)).toBe('—')
  })
})

const SOLVED: PreviewAsset[] = [
  {
    identifier: 'AAA',
    included: true,
    capped: false,
    weight: 0.12,
    source_weight: 0.15,
    solved_weight: 0.12,
    weight_delta: -0.03
  },
  {
    identifier: 'BBB',
    included: true,
    capped: false,
    weight: 0.2,
    source_weight: 0.2,
    solved_weight: 0.2,
    weight_delta: 0
  },
  {
    identifier: 'CCC',
    included: false,
    capped: false,
    weight: 0,
    source_weight: 0.05,
    solved_weight: 0,
    weight_delta: -0.05
  },
  {
    identifier: 'DDD',
    included: true,
    capped: false,
    weight: 0.68,
    source_weight: 0.6,
    solved_weight: 0.68,
    weight_delta: 0.08
  }
]

describe('the solve face (BU-173)', () => {
  const solve: PreviewSolve = {
    source_index_id: 'TECH10',
    rebalance_date: '2025-06-20',
    objective: 'min_tracking_error',
    binding: ['maximum weight 12%'],
    constraints: [
      { label: 'maximum weight 12%', kind: 'ineq', slack: 0, unit: 'fraction', binding: true },
      { label: 'at most 12 names', kind: 'ineq', slack: 3, unit: 'count', binding: false }
    ]
  }
  const preview: PreviewResponse = {
    index_id: 'TECH10-OPT',
    as_of: '2025-06-30T00:00:00',
    assets: SOLVED,
    weights: { AAA: 0.12, BBB: 0.2, DDD: 0.68 },
    total_weight: 1,
    cap: null,
    cap_redistributed: 0,
    steps: null,
    solve
  }

  it('reads the face off `solve`, not off the absence of steps', () => {
    expect(solveOf(preview)?.objective).toBe('min_tracking_error')
    // A rule-driven response sends solve: null, which is not a solve.
    expect(solveOf({ ...preview, solve: null })).toBeUndefined()
  })

  it('puts the biggest move first, which is what a solve is read for', () => {
    // Rank order says nothing here: the solve moved every weight at once.
    expect(solveRows(SOLVED).map((asset) => asset.identifier)).toEqual(['DDD', 'CCC', 'AAA', 'BBB'])
  })

  it('measures how far it moved from the parent', () => {
    // (0.03 + 0 + 0.05 + 0.08) / 2 — one-way, so a switch counts once.
    expect(summariseSolve(preview, solve).turnover).toBeCloseTo(0.08)
    expect(summariseSolve(preview, solve).binding).toBe(1)
    expect(summariseSolve(preview, solve).constraints).toBe(2)
  })
})

describe('describeRoom (BU-173)', () => {
  it('formats room in the constraint’s own unit', () => {
    // A weight limit's room is a fraction of the portfolio; a name limit's is
    // a count. One caption over the column would be wrong for one of them.
    expect(
      describeRoom({ label: 'w', kind: 'ineq', slack: 0.0812, unit: 'fraction', binding: false })
    ).toBe('8.12%')
    expect(
      describeRoom({ label: 'n', kind: 'ineq', slack: 3, unit: 'count', binding: false })
    ).toBe('3 names')
  })

  it('says bound rather than zero', () => {
    // Slack is zero at the boundary by definition, so the zero is the
    // definition restated — and a column of them reads as missing data.
    expect(
      describeRoom({ label: 'w', kind: 'eq', slack: 0, unit: 'fraction', binding: true })
    ).toBe('bound')
  })

  it('keeps a unit it does not know rather than guessing one', () => {
    expect(describeRoom({ label: 'x', kind: 'ineq', slack: 4, unit: 'bps', binding: false })).toBe(
      '4 bps'
    )
  })
})
