import { describe, expect, it } from 'vitest'
import { asPairs, fromFrame, fromRecords, isNumericColumn } from './database'

describe('fromFrame', () => {
  const FRAME = {
    index: ['2026-08-19T00:00:00', '2026-08-18T00:00:00'],
    columns: ['CLOSE', 'RATE'],
    data: [
      [288.03, null],
      [291.33, 1.08]
    ]
  }

  it('keeps every column, unrenamed and in order', () => {
    // The whole point of the view: a column that appears in py-beacon
    // tomorrow appears here tomorrow, with the engine's own name.
    expect(fromFrame(FRAME, 'Date').columns).toEqual(['Date', 'CLOSE', 'RATE'])
  })

  it('makes the index a column, because it is data the frame carries', () => {
    expect(fromFrame(FRAME, 'Date').rows[0]?.cells[0]).toBe('2026-08-19')
  })

  it('keeps a null as null rather than as a dash', () => {
    // A dash would be indistinguishable from a string that is genuinely "—".
    expect(fromFrame(FRAME, 'Date').rows[0]?.cells[2]).toBeNull()
  })

  it('survives an absent frame', () => {
    expect(fromFrame(undefined)).toEqual({ columns: [], rows: [] })
  })
})

describe('fromRecords', () => {
  it('unions the keys, since records are ragged', () => {
    // A corporate action carries different fields by kind, and a column that
    // only some rows have is still a real column.
    const table = fromRecords([
      { kind: 'DIVIDEND', value: 0.5 },
      { kind: 'SPLIT', ratio: 2 }
    ])
    expect(table.columns).toEqual(['kind', 'value', 'ratio'])
    expect(table.rows[1]?.cells).toEqual(['SPLIT', null, 2])
  })
})

describe('asPairs', () => {
  it('turns a single record into name and value rows', () => {
    expect(asPairs({ NAME: 'Alpha', SECTOR: 'Energy' })).toEqual({
      columns: ['Column', 'Value'],
      rows: [
        { key: 'NAME', cells: ['NAME', 'Alpha'] },
        { key: 'SECTOR', cells: ['SECTOR', 'Energy'] }
      ]
    })
  })
})

describe('isNumericColumn', () => {
  const table = fromRecords([
    { a: 1, b: 'x', c: null },
    { a: 2, b: 'y', c: null }
  ])

  it('right-aligns a column of numbers', () => {
    expect(isNumericColumn(table, 0)).toBe(true)
    expect(isNumericColumn(table, 1)).toBe(false)
  })

  it('does not call an all-null column numeric', () => {
    expect(isNumericColumn(table, 2)).toBe(false)
  })
})
