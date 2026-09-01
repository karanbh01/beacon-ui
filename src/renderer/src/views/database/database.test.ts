import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  asPairs,
  fromFrame,
  fromRecords,
  isNumericColumn,
  matchesFilter,
  withoutHidden
} from './database'

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

describe('withoutHidden (BU-139)', () => {
  const FRAME = {
    index: ['2026-08-19T00:00:00'],
    columns: ['CLOSE', 'RATE'],
    data: [[288.03, 1.08]]
  }

  it('drops RATE from a market table, cells and all', () => {
    // RATE is the FX dataset's column. On a market bar it is empty or
    // meaningless, and the reader should not have to work that out.
    const table = fromFrame(FRAME, 'Date')
    const shown = withoutHidden('market', table)

    expect(shown.columns).toEqual(['Date', 'CLOSE'])
    expect(shown.rows[0]?.cells).toHaveLength(2)
    expect(shown.rows[0]?.cells[1]).toBe(table.rows[0]?.cells[1])
  })

  it('leaves every other dataset alone, including the one RATE belongs to', () => {
    const table = fromFrame(FRAME, 'Date')
    expect(withoutHidden('fx', table)).toBe(table)
    expect(withoutHidden('reference', table).columns).toEqual(['Date', 'CLOSE', 'RATE'])
  })
})

describe('column filters (BU-138)', () => {
  const TABLE = {
    columns: ['IDENTIFIER', 'CLOSE'],
    rows: [
      { key: 'a', cells: ['CMP001', 140.2] },
      { key: 'b', cells: ['CMP002', 96.5] },
      { key: 'c', cells: ['OTHER', null] }
    ]
  }

  it('reads text as contains, case-insensitively', () => {
    expect(matchesFilter('CMP001', 'cmp')).toBe(true)
    expect(matchesFilter('CMP001', 'zzz')).toBe(false)
    // An empty box is not a filter.
    expect(matchesFilter(null, '  ')).toBe(true)
  })

  it('reads a comparison as a comparison, on numbers', () => {
    expect(matchesFilter(140.2, '>100')).toBe(true)
    expect(matchesFilter(96.5, '>100')).toBe(false)
    expect(matchesFilter(96.5, '<=96.5')).toBe(true)
    expect(matchesFilter(96.5, '=96.5')).toBe(true)
  })

  it('matches nothing when a comparison meets something that is not a number', () => {
    // Rather than falling through to a substring search for ">100", which
    // would quietly match the text "100 shares".
    expect(matchesFilter('100 shares', '>50')).toBe(false)
    expect(matchesFilter(null, '>0')).toBe(false)
  })

  it('narrows with every filter, rather than letting them compete', () => {
    const both = applyFilters(TABLE, { IDENTIFIER: 'CMP', CLOSE: '>100' })
    expect(both.rows.map((row) => row.cells[0])).toEqual(['CMP001'])

    // Columns keep their places: a filter hides rows, not columns.
    expect(both.columns).toEqual(TABLE.columns)
  })

  it('returns the table itself when nothing is being filtered', () => {
    expect(applyFilters(TABLE, { IDENTIFIER: '   ' })).toBe(TABLE)
  })
})
