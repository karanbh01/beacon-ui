import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsFindings, suggestDerived } from './settings'

describe('what stops a run (BU-174)', () => {
  it('passes the defaults, which are py-beacon’s own', () => {
    expect(settingsFindings(DEFAULT_SETTINGS, 'TECH10')).toEqual([])
  })

  it('asks for an index before anything else', () => {
    expect(settingsFindings(DEFAULT_SETTINGS, '')).toContain('Choose an index to back-test.')
  })

  it('accepts empty dates, because empty is not missing', () => {
    // py-beacon starts at the index base date and ends at its last
    // observation. Requiring a date here would replace a good answer with a
    // guess.
    const findings = settingsFindings({ ...DEFAULT_SETTINGS, start: '', end: '' }, 'TECH10')
    expect(findings).toEqual([])
  })

  it('catches a period that runs backwards', () => {
    const findings = settingsFindings(
      { ...DEFAULT_SETTINGS, start: '2024-01-01', end: '2023-01-01' },
      'TECH10'
    )
    expect(findings).toContain('Start is after end.')
  })

  it('refuses a capital of nothing, which the engine would too', () => {
    // `initial_capital` is exclusiveMinimum 0 in the schema, so this is the
    // 422 arriving early rather than a rule of our own.
    expect(settingsFindings({ ...DEFAULT_SETTINGS, initialCapital: '0' }, 'TECH10')).toContain(
      'Initial capital has to be more than zero.'
    )
    expect(settingsFindings({ ...DEFAULT_SETTINGS, initialCapital: '' }, 'TECH10')).toHaveLength(1)
  })

  it('refuses a negative cost', () => {
    expect(settingsFindings({ ...DEFAULT_SETTINGS, costBps: '-1' }, 'TECH10')).toContain(
      'Transaction cost cannot be negative.'
    )
  })
})

describe('the optimiser half (BU-174)', () => {
  const optimising = { ...DEFAULT_SETTINGS, optimise: true, derivedId: 'X', derivedName: 'X' }

  it('says nothing about a child while the box is off', () => {
    expect(settingsFindings({ ...DEFAULT_SETTINGS, derivedId: '' }, 'TECH10')).toEqual([])
  })

  it('needs an id the engine’s pattern accepts', () => {
    const findings = settingsFindings({ ...optimising, derivedId: 'no spaces' }, 'TECH10')
    expect(findings[0]).toMatch(/needs an id/)
    expect(settingsFindings({ ...optimising, derivedId: '' }, 'TECH10')).toHaveLength(1)
  })

  it('refuses to name the child after its parent', () => {
    // Which the engine would answer 409 to, having a document there already.
    expect(settingsFindings({ ...optimising, derivedId: 'TECH10' }, 'TECH10')).toContain(
      'The optimised index needs an id of its own, not the parent’s.'
    )
  })

  it('needs a name, and does not count whitespace as one', () => {
    expect(settingsFindings({ ...optimising, derivedName: '   ' }, 'TECH10')).toContain(
      'The optimised index needs a name.'
    )
  })
})

describe('suggestDerived', () => {
  it('offers a starting point built from the parent', () => {
    expect(suggestDerived('TECH10', 'Beacon US Tech 10')).toEqual({
      id: 'TECH10-OPT',
      name: 'Beacon US Tech 10 optimised'
    })
  })

  it('falls back to the id when the parent has no name yet', () => {
    expect(suggestDerived('TECH10', '').name).toBe('TECH10 optimised')
  })

  it('keeps the id inside py-beacon’s 64 characters', () => {
    expect(suggestDerived('A'.repeat(70), '').id).toHaveLength(64)
  })
})
