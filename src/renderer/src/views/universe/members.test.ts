import { describe, expect, it } from 'vitest'
import {
  addMember,
  blankUniverse,
  draftProblem,
  isEditable,
  parseMembers,
  removeMember
} from './members'

describe('parseMembers', () => {
  it('takes a list however it was separated', () => {
    // A pasted list arrives from a spreadsheet column, a CSV, or a screener,
    // and every one of those uses a different separator.
    expect(parseMembers('AAPL, MSFT')).toEqual(['AAPL', 'MSFT'])
    expect(parseMembers('AAPL\nMSFT')).toEqual(['AAPL', 'MSFT'])
    expect(parseMembers('AAPL MSFT')).toEqual(['AAPL', 'MSFT'])
    expect(parseMembers('AAPL;MSFT|NVDA')).toEqual(['AAPL', 'MSFT', 'NVDA'])
  })

  it('upper-cases, because py-beacon identifiers are', () => {
    expect(parseMembers('aapl')).toEqual(['AAPL'])
  })

  it('keeps the pasted order and drops duplicates', () => {
    expect(parseMembers('MSFT, AAPL, MSFT')).toEqual(['MSFT', 'AAPL'])
  })

  it('survives ragged whitespace and an empty paste', () => {
    expect(parseMembers('  AAPL ,, \n  MSFT  ')).toEqual(['AAPL', 'MSFT'])
    expect(parseMembers('   ')).toEqual([])
  })
})

describe('addMember / removeMember', () => {
  it('adds without duplicating', () => {
    expect(addMember(['AAPL'], 'MSFT')).toEqual(['AAPL', 'MSFT'])
    expect(addMember(['AAPL'], 'aapl')).toEqual(['AAPL'])
  })

  it('ignores an empty entry', () => {
    expect(addMember(['AAPL'], '   ')).toEqual(['AAPL'])
  })

  it('removes one without touching the rest', () => {
    expect(removeMember(['AAPL', 'MSFT'], 'AAPL')).toEqual(['MSFT'])
  })
})

describe('isEditable', () => {
  it('refuses a universe the engine seeded', () => {
    // The ENGINE's answer, via `source` — not a guess from the id. Keying off
    // the name `GLOBAL` would break the moment a second seeded one existed.
    expect(isEditable({ source: 'seeded' })).toBe(false)
  })

  it('allows one somebody created', () => {
    expect(isEditable({ source: 'user' })).toBe(true)
  })

  it('says nothing is editable when there is nothing selected', () => {
    expect(isEditable(undefined)).toBe(false)
  })
})

describe('draftProblem', () => {
  it('wants a name and at least one member', () => {
    expect(draftProblem(blankUniverse())).toContain('name')
    expect(draftProblem({ name: 'Tech', description: '', members: [] })).toContain('member')
  })

  it('holds the engine’s own 64-character limit', () => {
    const long = { name: 'x'.repeat(65), description: '', members: ['AAPL'] }
    expect(draftProblem(long)).toContain('64')
  })

  it('passes a draft the engine will accept', () => {
    expect(draftProblem({ name: 'Tech', description: '', members: ['AAPL'] })).toBeUndefined()
  })
})
