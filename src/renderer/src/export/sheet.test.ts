import { describe, expect, it } from 'vitest'
import { fileStem, sheetFromFrame, toCsv, toWorkbookRows } from './sheet'

const SHEET = {
  name: 'Prices CMP000',
  columns: ['Date', 'Close', 'Note'],
  rows: [
    ['2026-08-19', 288.03, 'plain'],
    ['2026-08-18', null, 'Alpha Corp, Inc.'],
    ['2026-08-17', 0, 'he said "no"']
  ]
}

describe('toCsv', () => {
  it('quotes a field that would otherwise split the row', () => {
    // Company names carry commas, so this is the common case rather than an
    // edge one.
    expect(toCsv(SHEET)).toContain('"Alpha Corp, Inc."')
  })

  it('doubles an embedded quote, as RFC 4180 says', () => {
    expect(toCsv(SHEET)).toContain('"he said ""no"""')
  })

  it('writes an empty field for a null, not the word null', () => {
    expect(toCsv(SHEET)).toContain('2026-08-18,,')
  })

  it('keeps a zero, which is a number and not a blank', () => {
    expect(toCsv(SHEET)).toContain('2026-08-17,0,')
  })

  it('leads with a BOM so Excel reads it as UTF-8', () => {
    // Without it Excel uses the local codepage and any accented name opens
    // mangled.
    expect(toCsv(SHEET).codePointAt(0)).toBe(0xfeff)
  })

  it('ends its lines CRLF, which is what the format specifies', () => {
    expect(toCsv(SHEET)).toContain('\r\n')
  })
})

describe('toWorkbookRows', () => {
  it('keeps numbers as numbers, so Excel can sum them', () => {
    // The whole reason to want xlsx over CSV: a number written as text sorts
    // and totals wrongly.
    const rows = toWorkbookRows(SHEET)
    expect(rows[1]?.[1]).toMatchObject({ value: 288.03, type: Number })
  })

  it('sends a null through as a blank cell rather than a string', () => {
    expect(toWorkbookRows(SHEET)[2]?.[1]).toEqual({ value: null })
  })

  it('puts the headers in the first row, in bold', () => {
    expect(toWorkbookRows(SHEET)[0]?.[0]).toMatchObject({ value: 'Date', fontWeight: 'bold' })
  })
})

describe('sheetFromFrame', () => {
  const FRAME = {
    index: ['2026-08-19T00:00:00', '2026-08-18T00:00:00'],
    columns: ['CLOSE', 'RATE'],
    data: [
      [288.03, null],
      [291.33, 1.08]
    ]
  }

  it('exports the engine’s columns, not the display table’s', () => {
    // The table drops columns it has no room for and rounds what it keeps;
    // an export is for the numbers.
    expect(sheetFromFrame(FRAME, 'x').columns).toEqual(['Date', 'CLOSE', 'RATE'])
  })

  it('trims the midnight off an index date', () => {
    expect(sheetFromFrame(FRAME, 'x').rows[0]?.[0]).toBe('2026-08-19')
  })

  it('survives having no frame at all', () => {
    expect(sheetFromFrame(undefined, 'x').rows).toEqual([])
  })
})

describe('fileStem', () => {
  it('makes a name safe on every filesystem', () => {
    expect(fileStem('Prices · CMP000')).toBe('prices-cmp000')
  })

  it('never returns an empty name', () => {
    expect(fileStem('···')).toBe('export')
  })
})
