import { describe, expect, it } from 'vitest'
import { clampSplit, LAYOUT_OPTIONS, MIN_SPLIT } from '../state/chrome'
import { dividersFor, gridAreaFor, layoutById, panesFor } from './paneGrid'

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
    expect(panesFor('rows')).toHaveLength(2)
  })

  it('falls back to a single pane rather than taking the shell down', () => {
    // A layout id stored by a newer version has to survive a downgrade.
    expect(layoutById('hexagonal').id).toBe('single')
  })
})

describe('dividersFor', () => {
  const dividers = (id: string): string[] =>
    dividersFor(panesFor(id)).map((d) => `${d.axis} col=${d.gridColumn} row=${d.gridRow}`)

  it('gives a single pane nothing to drag', () => {
    expect(dividers('single')).toEqual([])
  })

  it('gives two columns one full-height divider and no horizontal one', () => {
    expect(dividers('columns')).toEqual(['x col=1 row=1 / 3'])
  })

  it('gives two rows one full-width divider and no vertical one', () => {
    // The mirror of `columns`, and the assertion that would fail if the
    // stacked layout were declared as two half-width panes by mistake.
    expect(dividers('rows')).toEqual(['y col=1 / 3 row=1'])
  })

  it('gives the grid both, each spanning everything', () => {
    expect(dividers('grid')).toEqual(['x col=1 row=1 / 3', 'y col=1 / 3 row=1'])
  })

  it('stops the horizontal divider at the column that is actually stacked', () => {
    // main-stack splits only its right column, so a full-width handle would
    // sit across the main pane dividing nothing.
    expect(dividers('main-stack')).toEqual(['x col=1 row=1 / 3', 'y col=2 / 3 row=1'])
  })

  it('stops the vertical divider at the row that is actually split', () => {
    // banner's top pane is full width; only the bottom row has two panes.
    expect(dividers('banner')).toEqual(['x col=1 row=2 / 3', 'y col=1 / 3 row=1'])
  })

  it('never offers a divider a layout has no use for', () => {
    for (const option of LAYOUT_OPTIONS) {
      const axes = dividersFor(option.panes).map((d) => d.axis)
      expect(new Set(axes).size, option.id).toBe(axes.length)
      expect(axes.length, option.id).toBeLessThanOrEqual(2)
    }
  })
})

describe('clampSplit', () => {
  it('leaves a sane split alone', () => {
    expect(clampSplit(0.7)).toBe(0.7)
  })

  it('will not let a pane be dragged away to nothing', () => {
    // A pane resized to zero is a pane you cannot get back — its divider ends
    // up under the window edge with no handle left to grab.
    expect(clampSplit(0)).toBe(MIN_SPLIT)
    expect(clampSplit(1)).toBe(1 - MIN_SPLIT)
    expect(clampSplit(-4)).toBe(MIN_SPLIT)
  })
})
