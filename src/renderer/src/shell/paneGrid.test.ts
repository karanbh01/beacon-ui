import { describe, expect, it } from 'vitest'
import { LAYOUT_OPTIONS } from '../state/chrome'
import { gridAreaFor, layoutById, panesFor } from './paneGrid'

/**
 * The glyph rectangles and the real layout come from one table, so these
 * assert that every arrangement in the menu maps onto the 2x2 grid exactly —
 * no arrangement half-covering a track, no pane sharing a cell.
 */
describe('gridAreaFor', () => {
  it('gives a single pane the whole grid', () => {
    expect(gridAreaFor({ x: 0, y: 0, w: 24, h: 24 })).toEqual({
      gridColumn: '1 / span 2',
      gridRow: '1 / span 2'
    })
  })

  it('puts a right-hand pane in the second column', () => {
    expect(gridAreaFor({ x: 13, y: 0, w: 11, h: 24 })).toEqual({
      gridColumn: '2 / span 1',
      gridRow: '1 / span 2'
    })
  })

  it('gives a banner both columns and one row', () => {
    expect(gridAreaFor({ x: 0, y: 0, w: 24, h: 11 })).toEqual({
      gridColumn: '1 / span 2',
      gridRow: '1 / span 1'
    })
  })

  it('covers every cell exactly once, for every layout in the menu', () => {
    for (const option of LAYOUT_OPTIONS) {
      const covered = option.panes.flatMap((pane) => {
        const columns = pane.w > 12 ? [1, 2] : [pane.x < 12 ? 1 : 2]
        const rows = pane.h > 12 ? [1, 2] : [pane.y < 12 ? 1 : 2]
        return columns.flatMap((column) => rows.map((row) => `${String(column)},${String(row)}`))
      })

      expect(covered.sort(), option.id).toEqual(['1,1', '1,2', '2,1', '2,2'])
    }
  })
})

describe('layoutById', () => {
  it('resolves each option in the menu', () => {
    expect(panesFor('grid')).toHaveLength(4)
    expect(panesFor('columns')).toHaveLength(2)
  })

  it('falls back to a single pane rather than taking the shell down', () => {
    // A layout id stored by a newer version has to survive a downgrade.
    expect(layoutById('hexagonal').id).toBe('single')
  })
})
