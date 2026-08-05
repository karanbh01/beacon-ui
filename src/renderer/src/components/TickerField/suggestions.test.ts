import { describe, expect, it } from 'vitest'
import {
  matchSuggestions,
  mergeIndex,
  mergeSuggestions,
  unavailableFor,
  type Suggestion
} from './suggestions'

const INDEX: Suggestion[] = [
  { identifier: 'AAPL', name: 'Apple Inc.' },
  { identifier: 'CMP000', name: 'CMP000 Corporation' },
  { identifier: 'CMP001', name: 'Applied Materials' },
  { identifier: 'MSFT', name: 'Microsoft Corporation' },
  { identifier: 'NONAME' }
]

const ids = (query: string): string[] => matchSuggestions(query, INDEX).map((row) => row.identifier)

describe('matchSuggestions', () => {
  it('says nothing until something is typed', () => {
    // Open-on-type: an empty query producing rows would leave the panel
    // hanging open over the view.
    expect(matchSuggestions('', INDEX)).toEqual([])
    expect(matchSuggestions('   ', INDEX)).toEqual([])
  })

  it('matches on the name as well as the ticker, so "apple" finds AAPL', () => {
    expect(ids('apple')).toContain('AAPL')
  })

  it('ranks a ticker prefix above a name match', () => {
    // Someone typing CMP00 wants CMP000, not the company whose name happens
    // to start with "Applied".
    expect(ids('cmp00')).toEqual(['CMP000', 'CMP001'])
    expect(ids('app')[0]).toBe('AAPL')
  })

  it('puts an exact ticker first even when others start with it', () => {
    expect(ids('cmp000')[0]).toBe('CMP000')
  })

  it('ignores case in both directions', () => {
    expect(ids('AAPL')).toEqual(ids('aapl'))
  })

  it('offers an identifier reference data could not name', () => {
    expect(ids('noname')).toEqual(['NONAME'])
  })

  it('finds nothing for a fragment nobody carries', () => {
    expect(ids('zzzz')).toEqual([])
  })

  it('caps the list, so the panel stays a panel', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      identifier: `SYM${String(i).padStart(3, '0')}`
    }))
    expect(matchSuggestions('sym', many)).toHaveLength(8)
  })
})

describe('mergeIndex', () => {
  it('keeps one row per identifier', () => {
    const merged = mergeIndex([{ identifier: 'AAPL' }], [{ identifier: 'AAPL' }])
    expect(merged).toHaveLength(1)
  })

  it('lets a named entry win over a bare one, whichever came first', () => {
    // An open tab contributes a bare ticker; reference data knows the name.
    // Whichever order they arrive in, the row must keep the name.
    const named = { identifier: 'AAPL', name: 'Apple Inc.' }
    expect(mergeIndex([named], [{ identifier: 'AAPL' }])[0]).toEqual(named)
    expect(mergeIndex([{ identifier: 'AAPL' }], [named])[0]).toEqual(named)
  })
})

describe('mergeSuggestions', () => {
  const RANKED: Suggestion[] = [
    { identifier: 'CMP010', name: 'CMP010 Corporation' },
    { identifier: 'CMP011', name: 'CMP011 Corporation' }
  ]

  it('keeps the server order rather than re-sorting it', () => {
    // BN-127 ranks server-side, and once `limit` is applied the client cannot
    // re-rank what it was not sent. Re-sorting would replace a complete
    // judgement with one made on a subset.
    const backwards: Suggestion[] = [{ identifier: 'ZZZ' }, { identifier: 'AAA' }]
    expect(mergeSuggestions(backwards, [], 'a').map((r) => r.identifier)).toEqual(['ZZZ', 'AAA'])
  })

  it('appends local matches the engine did not offer', () => {
    const local: Suggestion[] = [{ identifier: 'CMP999' }]
    const merged = mergeSuggestions(RANKED, local, 'cmp')

    expect(merged.map((r) => r.identifier)).toEqual(['CMP010', 'CMP011', 'CMP999'])
  })

  it('does not offer the same identifier twice', () => {
    const local: Suggestion[] = [{ identifier: 'CMP010' }]
    expect(mergeSuggestions(RANKED, local, 'cmp')).toHaveLength(2)
  })

  it('ignores a local row that does not match', () => {
    const local: Suggestion[] = [{ identifier: 'MSFT' }]
    expect(mergeSuggestions(RANKED, local, 'cmp').map((r) => r.identifier)).toEqual([
      'CMP010',
      'CMP011'
    ])
  })

  it('is the local index alone when there is no engine to ask', () => {
    const local: Suggestion[] = [{ identifier: 'CMP000' }, { identifier: 'MSFT' }]
    expect(mergeSuggestions([], local, 'cmp').map((r) => r.identifier)).toEqual(['CMP000'])
  })
})

describe('unavailableFor', () => {
  it('marks a row the engine says lacks the dataset', () => {
    expect(unavailableFor({ identifier: 'X', datasets: ['reference'] }, 'market')).toBe(true)
  })

  it('leaves a covered row alone', () => {
    expect(unavailableFor({ identifier: 'X', datasets: ['market'] }, 'market')).toBe(false)
  })

  it('treats a missing dataset list as no claim, not as a denial', () => {
    // A suggestion taken from an open tab carries no coverage claim. Marking
    // it unavailable would be inventing one.
    expect(unavailableFor({ identifier: 'X' }, 'market')).toBe(false)
  })

  it('marks nothing when the view has no requirement', () => {
    expect(unavailableFor({ identifier: 'X', datasets: [] }, undefined)).toBe(false)
  })
})
