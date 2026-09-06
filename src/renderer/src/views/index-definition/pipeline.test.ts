import { describe, expect, it } from 'vitest'
import {
  GROUPS,
  addCap,
  addRule,
  addSlotFor,
  addTreatment,
  applyRow,
  draftFindings,
  hasWeighting,
  isDerived,
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
  removeRow,
  removeRule,
  replaceRule,
  warningsOf,
  type IndexDocument,
  type PipelineSpec,
  type PreviewStep
} from './pipeline'

/**
 * The fixture's pipeline.
 *
 * `IndexDocument.pipeline` is nullable since BN-168 — a document carries it or
 * a derivation — and every fixture here is a rule-driven index. Saying so once
 * keeps the assertions about what they are testing (BU-170).
 */
function pipe(document: IndexDocument): PipelineSpec {
  const spec = document.pipeline
  if (spec === null || spec === undefined) throw new Error('fixture has no pipeline')
  return spec
}

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
    expect(addSlotFor('selection', doc())).toEqual({ label: 'Add rule…' })
  })

  it('offers the weighting itself while there is none, and the cap after', () => {
    const none = doc()
    pipe(none).weighting = { id: 'weighting', scheme: '', params: {} }
    expect(addSlotFor('weighting', none).label).toBe('Add weighting…')

    const uncapped = doc()
    pipe(uncapped).weighting.max_weight = null
    expect(addSlotFor('weighting', uncapped)).toEqual({ label: 'Add cap…' })

    // Capped already: the cap is a field, so a second one is not a thing.
    expect(addSlotFor('weighting', doc()).blocked).toContain('Already capped')
  })

  it('lets treatment be added once, because py-beacon supports one value', () => {
    const none = doc()
    delete pipe(none).treatment
    expect(addSlotFor('treatment', none).blocked).toBeUndefined()

    expect(addSlotFor('treatment', doc()).blocked).toContain('ADJUST_DIVISOR')
  })
})

describe('addCap', () => {
  it('caps an uncapped index at the frame default', () => {
    const uncapped = doc()
    pipe(uncapped).weighting.max_weight = null

    expect(pipe(addCap(uncapped)).weighting.max_weight).toBe(0.2)
  })

  it('leaves the scheme and its params alone', () => {
    const uncapped = doc()
    pipe(uncapped).weighting.max_weight = null
    const capped = addCap(uncapped)

    expect(pipe(capped).weighting.scheme).toBe('MarketCapWeighted')
    expect(pipe(capped).selection).toEqual(pipe(uncapped).selection)
  })

  it('adds a cap ROW to the methodology, which is the visible point of it', () => {
    const uncapped = doc()
    pipe(uncapped).weighting.max_weight = null

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
    // A FIELD on the weighting spec rather than a rule, so it is edited with
    // the weighting — but it can be taken off on its own (BU-160).
    const cap = pipelineRows(doc()).find((row) => row.id === 'weighting-cap')
    expect(cap?.summary).toBe('Single-constituent cap 20.0%')
    expect(cap?.removable).toBe(true)
    expect(cap?.movable).toBe(false)
  })

  it('omits the cap row entirely when the index is uncapped', () => {
    const uncapped = doc({
      pipeline: { ...pipe(doc()), weighting: { id: 'weighting', scheme: 'EqualWeighted' } }
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

  it('reorders selection rules and nothing else — order is meaning there', () => {
    const rows = pipelineRows(doc())
    expect(rows.filter((row) => row.movable).map((row) => row.id)).toEqual(['r1', 'r2'])
  })

  it('lets every row be taken out, and the treatment be no more than that', () => {
    const rows = pipelineRows(doc())

    expect(rows.every((row) => row.removable)).toBe(true)
    // One legal value, so an editor could offer nothing (BU-160).
    expect(rows.find((row) => row.group === 'treatment')?.editable).toBe(false)
  })

  it('shows no weighting or treatment row until there is one', () => {
    const empty = blankIndex('NEW')
    expect(pipelineRows(empty)).toEqual([])
  })
})

describe('choosing, editing and removing rows (BU-160)', () => {
  it('knows whether a scheme has been chosen', () => {
    expect(hasWeighting(blankIndex('X'))).toBe(false)
    expect(hasWeighting(doc())).toBe(true)
  })

  it('carries the cap through the editor and back onto the spec', () => {
    const edited = applyRow(doc(), {
      id: 'weighting',
      type: 'MarketCapWeighted',
      params: { use_free_float: true, max_weight: 0.1 }
    })

    expect(pipe(edited).weighting.scheme).toBe('MarketCapWeighted')
    expect(pipe(edited).weighting.max_weight).toBe(0.1)
    // `max_weight` is a field of the spec, never one of the scheme's params.
    expect(pipe(edited).weighting.params).toEqual({ use_free_float: true })
  })

  it('takes the cap off without disturbing the scheme', () => {
    const uncapped = removeRow(doc(), 'weighting-cap')

    expect(pipe(uncapped).weighting.max_weight).toBeNull()
    expect(pipe(uncapped).weighting.scheme).toBe('MarketCapWeighted')
  })

  it('clears the whole weighting, cap and params with it', () => {
    const cleared = removeRow(doc(), 'weighting')

    expect(hasWeighting(cleared)).toBe(false)
    expect(pipe(cleared).weighting.max_weight).toBeNull()
    expect(pipe(cleared).weighting.params).toEqual({})
  })

  it('omits treatment rather than nulling it — the engine applies its own', () => {
    const without = removeRow(doc(), 'treatment')

    expect(Object.hasOwn(pipe(without), 'treatment')).toBe(false)
    expect(pipe(addTreatment(without)).treatment?.corporate_actions).toBe('ADJUST_DIVISOR')
  })

  it('still removes a selection rule by id', () => {
    expect((pipe(removeRow(doc(), 'r1')).selection ?? []).map((rule) => rule.id)).toEqual(['r2'])
  })

  it('says a scheme is missing before the engine is asked', () => {
    // `scheme` carries min_length 1, so an unchosen one is a 422 against the
    // request body rather than a finding anybody could act on.
    const findings = draftFindings(blankIndex('X'))

    expect(findings.map((finding) => finding.code)).toEqual(['NO_WEIGHTING'])
    expect(draftFindings(doc())).toEqual([])
  })
})

describe('draft transitions', () => {
  it('never reuses a rule id', () => {
    const added = addRule(doc())
    const ids = (pipe(added).selection ?? []).map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nextRuleId(added)).not.toBe(ids[ids.length - 1])
  })

  it('adds, replaces and removes without touching the rest of the document', () => {
    const before = doc()
    const after = removeRule(replaceRule(addRule(before), { id: 'r1', type: 'X' }), 'r2')

    expect((pipe(after).selection ?? []).map((rule) => rule.type)).toEqual(['X', 'FilterRule'])
    expect(pipe(after).weighting).toEqual(pipe(before).weighting)
    expect(after.name).toBe(before.name)
  })

  it('reorders, because order is the pipeline’s meaning', () => {
    // Filter-then-rank produces a different index from rank-then-filter.
    const moved = moveRule(doc(), 'r2', -1)
    expect((pipe(moved).selection ?? []).map((rule) => rule.id)).toEqual(['r2', 'r1'])
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
    // Nothing chosen: a weighting is the author's decision, and the engine
    // supplies its own treatment when none is sent (BU-160).
    expect(pipe(fresh).weighting.scheme).toBe('')
    expect(pipe(fresh).treatment).toBeUndefined()
  })

  it('starts with no selection rules, which validate should complain about', () => {
    // That complaint is the correct first thing to tell someone who has just
    // opened an empty index.
    expect(pipe(blankIndex('X')).selection).toEqual([])
  })

  it('is dirty from the start — nothing has been saved', () => {
    expect(isDirty(blankIndex('X'), undefined)).toBe(true)
  })
})

describe('a derived index carries no pipeline (BU-170)', () => {
  /**
   * What py-beacon stores for an optimised index (BN-168): a derivation and
   * identity, no pipeline and no universe. Exactly one of the two, enforced
   * server-side — neither or both is a 422.
   */
  function derived(): IndexDocument {
    const identity = doc()
    delete identity.pipeline
    delete identity.universe

    return {
      ...identity,
      derivation: {
        source_index_id: 'TECH10',
        objective: 'min_tracking_error',
        constraints: [{ id: 'c1', type: 'MaxWeight', params: { max: 0.05 } }]
      }
    }
  }

  it('is recognised as derived, which is the app’s whole switch', () => {
    expect(isDerived(derived())).toBe(true)
    expect(isDerived(doc())).toBe(false)
  })

  it('lists no methodology rows', () => {
    // Not "an index with no rules" — an index whose composition is its
    // derivation. The editor shows that instead.
    expect(pipelineRows(derived())).toEqual([])
  })

  it('has neither a weighting nor a treatment to report', () => {
    expect(hasWeighting(derived())).toBe(false)
    expect(addSlotFor('weighting', derived()).label).toBe('Add weighting…')
  })

  it('is left exactly as it was by every edit aimed at a pipeline', () => {
    const before = derived()

    // Nothing in the app can reach these on a derived document, since it
    // renders no methodology to click. These are the guards that keep that
    // true rather than trusting it.
    expect(addRule(before)).toBe(before)
    expect(addCap(before)).toBe(before)
    expect(addTreatment(before)).toBe(before)
    expect(removeRow(before, 'weighting')).toBe(before)
    expect(removeRow(before, 'treatment')).toBe(before)
    expect(applyRow(before, { id: 'r1', type: 'FilterRule', params: {} })).toBe(before)
    expect(moveRule(before, 'r1', 1)).toBe(before)
  })
})
