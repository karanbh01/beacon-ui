import { describe, expect, it } from 'vitest'
import {
  asDocument,
  blankStrategy,
  draftFindings,
  isDirty,
  withImplementation,
  withStrategy
} from './strategyDraft'

describe('a strategy draft', () => {
  it('is not dirty when the engine filled in its defaults', () => {
    // A stored strategy comes back with every default present; the draft
    // that saved it had them absent.
    const draft = { ...blankStrategy('tech10'), name: 'TECH10', index_id: 'TECH10' }
    const stored = {
      ...draft,
      description: null,
      strategy: { type: 'index', rebalancing: 'MONTHLY', constraints: [], universe: null },
      implementation: null
    }
    expect(isDirty(draft, stored)).toBe(false)
    expect(isDirty({ ...draft, name: 'Other' }, stored)).toBe(true)
  })

  it('drops what reading added before it is saved back', () => {
    const stored = {
      ...blankStrategy('x'),
      problem: { code: 'INDEX_NOT_FOUND', message: 'gone' }
    }
    expect(asDocument(stored)).not.toHaveProperty('problem')
  })

  it('goes back to no implementation when every setting is its default again', () => {
    const capped = withImplementation(blankStrategy('x'), {
      caps: [{ type: 'WeightCap', params: { max_weight: 0.1 } }]
    })
    expect(capped.implementation?.caps).toHaveLength(1)
    expect(withImplementation(capped, { caps: [] }).implementation).toBeNull()
  })

  it('keeps the kind when the spec changes', () => {
    const tracking = withStrategy(blankStrategy('x'), { type: 'index_tracking' })
    const sampled = withStrategy(tracking, {
      replication: { type: 'SampledReplication', params: { holdings: 15 } }
    })
    expect(sampled.strategy?.type).toBe('index_tracking')
  })

  it('says what stops a save before the engine is asked', () => {
    const tracking = withStrategy(blankStrategy('x'), { type: 'index_tracking' })
    expect(draftFindings(tracking)).toEqual([
      'A strategy needs a name.',
      'Choose the index it holds.',
      'Tracking needs a replication: how the index is held.'
    ])
  })
})
