import { describe, expect, it } from 'vitest'
import {
  GROUPS,
  addBlockedReason,
  addCap,
  addRule,
  asPercent,
  blankIndex,
  describeRule,
  describeWeighting,
  errorsOf,
  humanise,
  isDirty,
  moveRule,
  nextRuleId,
  pipelineRows,
  removeRule,
  replaceRule,
  warningsOf,
  type IndexDocument,
  type PreviewStep
} from './pipeline'

function doc(overrides: Partial<IndexDocument> = {}): IndexDocument {
  return {
    id: 'TECH10',
    name: 'Beacon US Technology Top 10',
    currency: 'USD',
    base_date: '2019-12-31',
    base_value: 100,
    rebalancing_frequency: 'QUARTERLY',
    return_type: 'PRICE',
    rebalance_day_rule: 'FIRST_BUSINESS_DAY',
    effective_lag_sessions: 0,
    withholding_tax_rate: 0,
    universe: { universe_id: 'US-LARGECAP' },
    pipeline: {
      selection: [
        { id: 'r1', type: 'FilterRule', params: { sector: 'Information Technology' } },
        { id: 'r2', type: 'RankRule', params: { by: 'market_cap', descending: true } }
      ],
      weighting: { id: 'weighting', scheme: 'MarketCapWeighted', max_weight: 0.2, params: {} },
      treatment: { corporate_actions: 'ADJUST_DIVISOR' }
    },
    ...overrides
  }
}

describe('GROUPS', () => {
  it('draws an add slot under every group, as Figma does', () => {
    expect(GROUPS.map((group) => group.id)).toEqual(['selection', 'weighting', 'treatment'])
  })

  it('lets selection take another rule', () => {
    expect(addBlockedReason('selection', doc())).toBeUndefined()
  })

  it('lets an uncapped index be capped, and a capped one not', () => {
    // Weighting is ONE WeightingSpec whose cap is a nullable FIELD, so the
    // only thing "add" can mean here is the cap, once.
    const uncapped = doc()
    uncapped.pipeline.weighting.max_weight = null
    expect(addBlockedReason('weighting', uncapped)).toBeUndefined()

    expect(addBlockedReason('weighting', doc())).toContain('Already capped')
  })

  it('never lets treatment take anything, because py-beacon supports one', () => {
    expect(addBlockedReason('treatment', doc())).toContain('ADJUST_DIVISOR')
  })
})

describe('addCap', () => {
  it('caps an uncapped index at the frame default', () => {
    const uncapped = doc()
    uncapped.pipeline.weighting.max_weight = null

    expect(addCap(uncapped).pipeline.weighting.max_weight).toBe(0.2)
  })

  it('leaves the scheme and its params alone', () => {
    const uncapped = doc()
    uncapped.pipeline.weighting.max_weight = null
    const capped = addCap(uncapped)

    expect(capped.pipeline.weighting.scheme).toBe('MarketCapWeighted')
    expect(capped.pipeline.selection).toEqual(uncapped.pipeline.selection)
  })

  it('adds a cap ROW to the methodology, which is the visible point of it', () => {
    const uncapped = doc()
    uncapped.pipeline.weighting.max_weight = null

    expect(pipelineRows(uncapped).filter((row) => row.type === 'Cap')).toHaveLength(0)
    expect(pipelineRows(addCap(uncapped)).filter((row) => row.type === 'Cap')).toHaveLength(1)
  })
})

describe('humanise', () => {
  it('turns a class name into prose', () => {
    expect(humanise('FilterRule')).toBe('Filter rule')
    expect(humanise('FreeFloatMarketCapRule')).toBe('Free float market cap rule')
  })

  it('splits snake_case too, so a parameter key never leaks as-is', () => {
    expect(humanise('min_cap')).toBe('Min cap')
  })

  it('leaves something it cannot split alone', () => {
    expect(humanise('')).toBe('')
  })
})

describe('describeRule', () => {
  it('reads free-form params as a sentence', () => {
    expect(describeRule({ id: 'r', type: 'FilterRule', params: { min_cap: 50_000 } })).toBe(
      'Min cap 50,000'
    )
  })

  it('names the rule when it carries no params', () => {
    expect(describeRule({ id: 'r', type: 'MarketCapRule' })).toBe('market capitalisation')
    expect(describeRule({ id: 'r', type: 'MysteryRule', params: {} })).toBe('Mystery rule')
  })

  it('renders lists and booleans rather than [object Object]', () => {
    const rule = {
      id: 'r',
      type: 'FilterRule',
      params: { sectors: ['IT', 'Health'], strict: true }
    }
    expect(describeRule(rule)).toBe('Sectors IT, Health · Strict yes')
  })
})

describe('describeWeighting', () => {
  it('names the scheme', () => {
    expect(describeWeighting({ id: 'w', scheme: 'EqualWeighted' })).toBe('Equal weighted')
  })
})

describe('pipelineRows', () => {
  it('lists selection, then weighting, then treatment', () => {
    const rows = pipelineRows(doc())
    expect(rows.map((row) => row.group)).toEqual([
      'selection',
      'selection',
      'weighting',
      'weighting',
      'treatment'
    ])
  })

  it('renders the cap as its own row, since the design shows one', () => {
    // It is a FIELD on the weighting spec, not a rule — so the row is fixed
    // and cannot be removed or reordered.
    const cap = pipelineRows(doc()).find((row) => row.id === 'weighting-cap')
    expect(cap?.summary).toBe('Single-constituent cap 20.0%')
    expect(cap?.fixed).toBe(true)
  })

  it('omits the cap row entirely when the index is uncapped', () => {
    const uncapped = doc({
      pipeline: { ...doc().pipeline, weighting: { id: 'weighting', scheme: 'EqualWeighted' } }
    })
    expect(pipelineRows(uncapped).some((row) => row.id === 'weighting-cap')).toBe(false)
  })

  it('attaches preview counts by rule id, not by position', () => {
    // A draft that added a rule must not shift the last preview's counts
    // onto the wrong rows.
    const steps: PreviewStep[] = [
      { position: 0, remaining: 512 },
      { position: 1, rule_id: 'r2', rule_type: 'RankRule', remaining: 24 }
    ]
    const rows = pipelineRows(doc(), steps)

    expect(rows.find((row) => row.id === 'r1')?.outcome).toBeUndefined()
    expect(rows.find((row) => row.id === 'r2')?.outcome).toBe('24 pass')
  })

  it('marks only selection rules as editable', () => {
    const rows = pipelineRows(doc())
    expect(rows.filter((row) => !row.fixed).map((row) => row.id)).toEqual(['r1', 'r2'])
  })
})

describe('draft transitions', () => {
  it('never reuses a rule id', () => {
    const added = addRule(doc())
    const ids = (added.pipeline.selection ?? []).map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nextRuleId(added)).not.toBe(ids[ids.length - 1])
  })

  it('adds, replaces and removes without touching the rest of the document', () => {
    const before = doc()
    const after = removeRule(replaceRule(addRule(before), { id: 'r1', type: 'X' }), 'r2')

    expect((after.pipeline.selection ?? []).map((rule) => rule.type)).toEqual(['X', 'FilterRule'])
    expect(after.pipeline.weighting).toEqual(before.pipeline.weighting)
    expect(after.name).toBe(before.name)
  })

  it('reorders, because order is the pipeline’s meaning', () => {
    // Filter-then-rank produces a different index from rank-then-filter.
    const moved = moveRule(doc(), 'r2', -1)
    expect((moved.pipeline.selection ?? []).map((rule) => rule.id)).toEqual(['r2', 'r1'])
  })

  it('refuses a move off either end rather than wrapping', () => {
    const before = doc()
    expect(moveRule(before, 'r1', -1)).toBe(before)
    expect(moveRule(before, 'r2', 1)).toBe(before)
    expect(moveRule(before, 'nope', 1)).toBe(before)
  })

  it('does not mutate the document handed in', () => {
    const before = doc()
    const snapshot = JSON.stringify(before)
    addRule(before)
    removeRule(before, 'r1')
    moveRule(before, 'r1', 1)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('isDirty', () => {
  it('treats an unsaved index as dirty from the start', () => {
    expect(isDirty(doc(), undefined)).toBe(true)
  })

  it('is false for an untouched draft', () => {
    expect(isDirty(doc(), doc())).toBe(false)
  })

  it('notices a change anywhere in the pipeline', () => {
    expect(isDirty(addRule(doc()), doc())).toBe(true)
  })
})

describe('findings', () => {
  const findings = [
    { code: 'A', message: 'bad', path: 'pipeline', severity: 'error' },
    { code: 'B', message: 'odd', path: 'universe', severity: 'warning' }
  ]

  it('separates what blocks a save from what does not', () => {
    expect(errorsOf(findings).map((f) => f.code)).toEqual(['A'])
    expect(warningsOf(findings).map((f) => f.code)).toEqual(['B'])
  })
})

describe('asPercent', () => {
  it('renders py-beacon fractions', () => {
    expect(asPercent(0.2)).toBe('20.0%')
    expect(asPercent(1, 2)).toBe('100.00%')
  })

  it('says nothing for an uncapped index', () => {
    expect(asPercent(null)).toBe('—')
  })
})

describe('blankIndex', () => {
  it('is a document py-beacon will accept, not a half-filled shell', () => {
    const fresh = blankIndex('NEWIDX')

    expect(fresh.id).toBe('NEWIDX')
    expect(fresh.pipeline.weighting.scheme).toBe('EqualWeighted')
    expect(fresh.pipeline.treatment?.corporate_actions).toBe('ADJUST_DIVISOR')
  })

  it('starts with no selection rules, which validate should complain about', () => {
    // That complaint is the correct first thing to tell someone who has just
    // opened an empty index.
    expect(blankIndex('X').pipeline.selection).toEqual([])
  })

  it('is dirty from the start — nothing has been saved', () => {
    expect(isDirty(blankIndex('X'), undefined)).toBe(true)
  })
})
