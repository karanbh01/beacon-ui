import { describe, expect, it } from 'vitest'
import { FACTSHEET_SECTIONS, orderedSelection, renderFilename, toggle } from './sections'

describe('toggle', () => {
  it('adds and removes a section', () => {
    expect(toggle([], 'risk')).toEqual(['risk'])
    expect(toggle(['risk', 'cover'], 'risk')).toEqual(['cover'])
  })

  it('does not mutate the selection handed in', () => {
    const before = ['risk']
    toggle(before, 'cover')
    expect(before).toEqual(['risk'])
  })
})

describe('orderedSelection', () => {
  it('renders in the design’s order, not the order boxes were ticked', () => {
    const selection = orderedSelection(['disclaimer', 'cover', 'risk'])
    expect(selection.map((section) => section.id)).toEqual(['cover', 'risk', 'disclaimer'])
  })

  it('ignores an id no section carries', () => {
    expect(orderedSelection(['nope'])).toEqual([])
  })

  it('can select everything', () => {
    const all = FACTSHEET_SECTIONS.map((section) => section.id)
    expect(orderedSelection(all)).toHaveLength(FACTSHEET_SECTIONS.length)
  })
})

describe('renderFilename', () => {
  it('names the file after the index, the template and the date', () => {
    expect(renderFilename('FACTSHEET-A4', 'TECH10', new Date('2026-07-28T00:00:00Z'))).toBe(
      'TECH10-FACTSHEET-A4-2026-07-28.pdf'
    )
  })

  it('drops an empty part rather than leaving a double dash', () => {
    expect(renderFilename('FACTSHEET-A4', '', new Date('2026-07-28T00:00:00Z'))).toBe(
      'FACTSHEET-A4-2026-07-28.pdf'
    )
  })
})
