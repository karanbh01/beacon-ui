import { describe, expect, it } from 'vitest'
import type { ReportTemplate } from '../shared/reportQueries'
import {
  addBlock,
  describeBlock,
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
      { kind: 'HeaderBlock', title: 'Index name', show_as_of: true },
      { kind: 'ChartBlock', series: ['level', 'benchmark'] },
      { kind: 'TableBlock', rows: 10 }
    ]
  }
}

describe('kindOf', () => {
  it('reads the one field py-beacon guarantees', () => {
    expect(kindOf({ kind: 'HeaderBlock' })).toBe('HeaderBlock')
  })

  it('names an untyped block rather than rendering "undefined"', () => {
    expect(kindOf({})).toBe('Block')
    expect(kindOf({ kind: 42 })).toBe('Block')
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
    expect(describeBlock({ kind: 'PageBreak' })).toBe('no settings')
  })

  it('elides a nested object instead of stringifying it', () => {
    expect(describeBlock({ kind: 'X', style: { bold: true } })).toBe('style …')
  })
})

describe('block transitions', () => {
  it('adds a block at the end, where it will be drawn', () => {
    const after = addBlock(template(), 'FooterBlock')
    expect(after.blocks?.[3]).toEqual({ kind: 'FooterBlock' })
  })

  it('replaces and removes by position, since blocks carry no id', () => {
    const after = removeBlock(replaceBlock(template(), 0, { kind: 'CoverBlock' }), 2)
    expect(after.blocks?.map(kindOf)).toEqual(['CoverBlock', 'ChartBlock'])
  })

  it('reorders — blocks are drawn top to bottom, so order IS the document', () => {
    // Unlike a constraint set, where order is presentation only.
    const moved = moveBlock(template(), 2, -1)
    expect(moved.blocks?.map(kindOf)).toEqual(['HeaderBlock', 'TableBlock', 'ChartBlock'])
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
