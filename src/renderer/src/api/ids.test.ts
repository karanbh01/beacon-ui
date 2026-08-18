import { describe, expect, it } from 'vitest'
import { isDocumentId } from './ids'

describe('isDocumentId', () => {
  it('accepts what py-beacon addresses a document by', () => {
    expect(isDocumentId('BEACON-ESG-50')).toBe(true)
    expect(isDocumentId('US_LARGECAP')).toBe(true)
    expect(isDocumentId('a')).toBe(true)
  })

  it('rejects a view title mistaken for an id', () => {
    // The bug this exists for: Index Definition passed its TAB TITLE as the
    // index id, so opening it from the sidebar asked the engine for an index
    // called "Index Definition" — a 404 on an older engine, and a 422 once
    // the path pattern was enforced.
    expect(isDocumentId('Index Definition')).toBe(false)
  })

  it('rejects empty, over-long and punctuated ids', () => {
    expect(isDocumentId('')).toBe(false)
    expect(isDocumentId(undefined)).toBe(false)
    expect(isDocumentId('a'.repeat(65))).toBe(false)
    expect(isDocumentId('beacon.esg.50')).toBe(false)
    expect(isDocumentId('../etc/passwd')).toBe(false)
  })
})
