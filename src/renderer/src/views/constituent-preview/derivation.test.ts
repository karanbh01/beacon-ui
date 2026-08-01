import { describe, expect, it } from 'vitest'
import {
  CELL_GLYPH,
  cellState,
  oneWayTurnover,
  percent,
  sortAssets,
  summarise,
  waterfallColumns,
  type PreviewAsset,
  type PreviewResponse,
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
