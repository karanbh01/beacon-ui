import { describe, expect, it } from 'vitest'
import {
  applyQueries,
  asPairs,
  fromFrame,
  fromRecords,
  isNumericColumn,
  isDateColumn,
  matchesFilter,
  readNumber,
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
    const both = applyQueries(TABLE, { IDENTIFIER: { filter: 'CMP' }, CLOSE: { filter: '>100' } })
    expect(both.rows.map((row) => row.cells[0])).toEqual(['CMP001'])

    // Columns keep their places: a filter hides rows, not columns.
    expect(both.columns).toEqual(TABLE.columns)
  })

  it('returns the table itself when nothing is being asked', () => {
    expect(applyQueries(TABLE, { IDENTIFIER: { filter: '   ' } })).toBe(TABLE)
  })
})

describe('sorting and ranges (BU-148)', () => {
  const TABLE = {
    columns: ['IDENTIFIER', 'DATE', 'CLOSE'],
    rows: [
      { key: 'a', cells: ['CMP002', '2025-03-02T00:00:00', 96.5] },
      { key: 'b', cells: ['CMP001', '2025-01-05T00:00:00', 140.2] },
      { key: 'c', cells: ['CMP003', '2025-02-01T00:00:00', null] }
    ]
  }

  it('sorts a column both ways, and leaves nulls last either way', () => {
    // A null is the absence of a value, not the smallest one.
    const up = applyQueries(TABLE, { CLOSE: { sort: 'asc' } })
    expect(up.rows.map((row) => row.cells[2])).toEqual([96.5, 140.2, null])

    const down = applyQueries(TABLE, { CLOSE: { sort: 'desc' } })
    expect(down.rows.map((row) => row.cells[2])).toEqual([140.2, 96.5, null])
  })

  it('sorts identifiers as text', () => {
    const sorted = applyQueries(TABLE, { IDENTIFIER: { sort: 'asc' } })
    expect(sorted.rows.map((row) => row.cells[0])).toEqual(['CMP001', 'CMP002', 'CMP003'])
  })

  it('takes one sort, so two columns cannot compete for the order', () => {
    const sorted = applyQueries(TABLE, {
      IDENTIFIER: { sort: 'desc' },
      CLOSE: { sort: 'asc' }
    })
    // The first column asking wins, which is at least predictable.
    expect(sorted.rows.map((row) => row.cells[0])).toEqual(['CMP003', 'CMP002', 'CMP001'])
  })

  it('ranges a date column inclusively at both ends', () => {
    const within = applyQueries(TABLE, { DATE: { from: '2025-01-05', to: '2025-02-01' } })
    expect(within.rows.map((row) => row.cells[0])).toEqual(['CMP001', 'CMP003'])
  })

  it('knows which columns are dates, since only those get a range', () => {
    expect(isDateColumn('DATE')).toBe(true)
    expect(isDateColumn('EX_DATE')).toBe(true)
    expect(isDateColumn('DATE_FROM')).toBe(true)
    expect(isDateColumn('IDENTIFIER')).toBe(false)
    // Not a date because it ends in one: `UPDATED` is not `UPDATE_DATE`.
    expect(isDateColumn('CLOSE')).toBe(false)
  })
})

describe('readNumber (BU-149)', () => {
  it('makes a float read like the price it means', () => {
    expect(readNumber(157.47000000000003)).toBe('157.47')
    expect(readNumber(156.85)).toBe('156.85')
  })

  it('leaves whole numbers whole, and groups them', () => {
    expect(readNumber(92_526)).toBe('92,526')
  })

  it('keeps enough of a small number to tell two apart', () => {
    expect(readNumber(0.6148680575343418)).toBe('0.6149')
  })
})
