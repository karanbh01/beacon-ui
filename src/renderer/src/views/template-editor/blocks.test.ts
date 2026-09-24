import { describe, expect, it } from 'vitest'
import type { ReportTemplate } from '../shared/reportQueries'
import {
  addBlock,
  BLOCK_KINDS,
  describeBlock,
  isBlockKind,
  isDirty,
  kindOf,
  moveBlock,
  pageRows,
  removeBlock,
  replaceBlock
} from './blocks'

function template(): ReportTemplate {
  return {
    template_id: 'FACTSHEET-A4',
    name: 'Factsheet A4',
    page: { size: 'A4', orientation: 'portrait', margin: 38 },
    blocks: [
      { kind: 'header', title: 'Index name', show_as_of: true },
      { kind: 'chart', series: ['level', 'benchmark'] },
      { kind: 'table', rows: 10 }
    ]
  }
}

describe('the kinds a block can be (BU-212)', () => {
  /*
   * A closed set, published since 0.1.0 and used by the engine since BN-75.
   * This editor guessed `TextBlock` for a new block while nothing said which
   * kinds existed — borrowing the index rules' naming — and the engine never
   * accepted that name. The fixtures below were written in the same guessed
   * vocabulary, which is why no test ever noticed.
   */
  it('offers exactly the published set, in words', () => {
    expect(Object.keys(BLOCK_KINDS).sort()).toEqual(
      ['bar_chart', 'chart', 'header', 'stat_grid', 'table', 'text'].sort()
    )
  })

  it('reads a block’s kind', () => {
    expect(kindOf({ kind: 'header' })).toBe('header')
  })

  it('tells a real kind from a name that merely looks like one', () => {
    expect(isBlockKind('text')).toBe(true)
    // The name this editor used to send. Plausible, and never valid.
    expect(isBlockKind('TextBlock')).toBe(false)
    // And not something inherited from an object's prototype.
    expect(isBlockKind('toString')).toBe(false)
  })
})

describe('describeBlock', () => {
  it('summarises the block’s other fields', () => {
    expect(describeBlock(template().blocks![0]!)).toBe('title Index name · show as of yes')
  })

  it('renders a list rather than [object Object]', () => {
    expect(describeBlock(template().blocks![1]!)).toBe('series level, benchmark')
  })

  it('says so when a block carries nothing but its kind', () => {
    expect(describeBlock({ kind: 'text' })).toBe('no settings')
  })

  it('elides a nested object instead of stringifying it', () => {
    expect(describeBlock({ kind: 'text', style: { bold: true } })).toBe('style …')
  })
})

describe('block transitions', () => {
  it('adds a block at the end, where it will be drawn', () => {
    const after = addBlock(template(), 'stat_grid')
    expect(after.blocks?.[3]).toEqual({ kind: 'stat_grid' })
  })

  it('adds a text block by default, which the engine will accept', () => {
    // It used to default to `TextBlock`, which it would not.
    expect(addBlock(template()).blocks?.[3]).toEqual({ kind: 'text' })
  })

  it('replaces and removes by position, since blocks carry no id', () => {
    const after = removeBlock(replaceBlock(template(), 0, { kind: 'text' }), 2)
    expect(after.blocks?.map(kindOf)).toEqual(['text', 'chart'])
  })

  it('reorders — blocks are drawn top to bottom, so order IS the document', () => {
    // Unlike a constraint set, where order is presentation only.
    const moved = moveBlock(template(), 2, -1)
    expect(moved.blocks?.map(kindOf)).toEqual(['header', 'table', 'chart'])
  })

  it('refuses a move off either end', () => {
    const before = template()
    expect(moveBlock(before, 0, -1)).toBe(before)
    expect(moveBlock(before, 2, 1)).toBe(before)
  })

  it('does not mutate the template handed in', () => {
    const before = template()
    const snapshot = JSON.stringify(before)
    addBlock(before)
    removeBlock(before, 0)
    moveBlock(before, 0, 1)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('pageRows', () => {
  it('exposes the free-form page setup as editable rows', () => {
    expect(pageRows(template()).map((row) => row.key)).toEqual(['size', 'orientation', 'margin'])
  })

  it('renders a non-string setting as JSON so it round-trips', () => {
    expect(pageRows(template()).find((row) => row.key === 'margin')?.value).toBe('38')
  })

  it('survives a template with no page block', () => {
    expect(pageRows({ template_id: 'X', name: 'X' })).toEqual([])
  })
})

describe('isDirty', () => {
  it('is false for an untouched draft and true after any edit', () => {
    expect(isDirty(template(), template())).toBe(false)
    expect(isDirty(addBlock(template()), template())).toBe(true)
    expect(isDirty(template(), undefined)).toBe(true)
  })
})
