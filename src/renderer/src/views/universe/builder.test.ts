import { describe, expect, it } from 'vitest'
import {
  checkManual,
  combine,
  describeRow,
  filtersFor,
  isComplete,
  labelFor,
  newRow,
  runRows,
  type Candidate,
  type FilterRow
} from './builder'

/** The shape a real engine returns: uppercase columns, one derived field. */
const POOL: Candidate[] = [
  { identifier: 'A', fields: { NAME: 'Alpha', SECTOR: 'Tech', EXCHANGE: 'XNAS', adv_3m: 900 } },
  { identifier: 'B', fields: { NAME: 'Beta', SECTOR: 'Tech', EXCHANGE: 'XLON', adv_3m: 500 } },
  {
    identifier: 'C',
    fields: { NAME: 'Gamma', SECTOR: 'Financials', EXCHANGE: 'XNAS', adv_3m: 700 }
  },
  { identifier: 'D', fields: { NAME: 'Delta', SECTOR: 'Health', EXCHANGE: 'XETR', adv_3m: 100 } }
]

const ids = (candidates: readonly Candidate[]): string[] =>
  candidates.map((candidate) => candidate.identifier)

describe('filtersFor', () => {
  it('offers a filter per real dimension, derived from the data', () => {
    // Not a hard-coded list: region, country and market cap are absent from
    // this engine, and inventing dropdowns for them would ship three that are
    // permanently empty.
    expect(
      filtersFor(POOL)
        .map((spec) => spec.field)
        .sort()
    ).toEqual(['EXCHANGE', 'SECTOR', 'adv_3m'])
  })

  it('never offers the name as a dimension', () => {
    // A multi-select of 512 company names is a list of the thing you are
    // trying to narrow.
    expect(filtersFor(POOL).some((spec) => spec.field === 'NAME')).toBe(false)
  })

  it('classifies strings as categories and numbers as ranges', () => {
    const specs = filtersFor(POOL)
    const sector = specs.find((spec) => spec.field === 'SECTOR')
    const adv = specs.find((spec) => spec.field === 'adv_3m')

    expect(sector?.kind).toBe('category')
    expect(sector?.values).toEqual(['Financials', 'Health', 'Tech'])
    expect(adv?.kind).toBe('range')
    expect(adv).toMatchObject({ min: 100, max: 900 })
  })

  it('skips a column that cannot narrow anything', () => {
    const flat: Candidate[] = [
      { identifier: 'A', fields: { CURRENCY: 'USD' } },
      { identifier: 'B', fields: { CURRENCY: 'USD' } }
    ]
    expect(filtersFor(flat)).toEqual([])
  })

  it('reads ragged rows, since a column missing from one name is still real', () => {
    const ragged: Candidate[] = [
      { identifier: 'A', fields: { SECTOR: 'Tech' } },
      { identifier: 'B', fields: {} },
      { identifier: 'C', fields: { SECTOR: 'Health' } }
    ]
    expect(filtersFor(ragged)[0]?.values).toEqual(['Health', 'Tech'])
  })
})

describe('labelFor', () => {
  it('makes an engine column readable', () => {
    expect(labelFor('SUB_INDUSTRY')).toBe('Sub industry')
    expect(labelFor('adv_3m')).toBe('Adv 3m')
  })
})

describe('checkManual', () => {
  it('names what it could not find rather than dropping it', () => {
    // Finding out at save time, for one name out of forty, is no use.
    const pool = new Set(['A', 'B'])
    expect(checkManual(['A', 'ZZZ'], pool)).toEqual({ found: ['A'], unknown: ['ZZZ'] })
  })
})

describe('combine', () => {
  it('is the filtered set plus the manual one, in that order', () => {
    expect(combine([POOL[0]!, POOL[1]!], ['Z'])).toEqual(['A', 'B', 'Z'])
  })

  it('never lists a name twice', () => {
    expect(combine([POOL[0]!], ['A', 'Z'])).toEqual(['A', 'Z'])
  })
})

const SPECS = filtersFor(POOL)

/** A complete row, so each test states only the part it is about. */
function row(over: Partial<FilterRow> = {}): FilterRow {
  return { ...newRow(over.kind ?? 'filter'), ...over }
}

describe('runRows', () => {
  it('matches nothing until a row is complete', () => {
    // The difference between a filter and a builder: opening the form must
    // not pre-select the whole dataset, and a half-built row must not either.
    expect(runRows(POOL, [], SPECS).matched).toEqual([])
    expect(runRows(POOL, [row()], SPECS).matched).toEqual([])
    expect(runRows(POOL, [row({ field: 'SECTOR', values: [] })], SPECS).matched).toEqual([])
  })

  it('reports what survives each row, which is the whole point of the row', () => {
    const rows = [
      row({ field: 'EXCHANGE', values: ['XNAS', 'XLON'] }),
      row({ field: 'SECTOR', values: ['Tech'] })
    ]
    const { matched, remaining } = runRows(POOL, rows, SPECS)

    expect(remaining).toEqual([3, 2])
    expect(ids(matched)).toEqual(['A', 'B'])
  })

  it('says nothing rather than zero for a row that did nothing', () => {
    // `—` on an incomplete row; a 0 would read as "this filter excluded
    // everything", which is a different and alarming statement.
    const { remaining } = runRows(POOL, [row(), row({ field: 'SECTOR', values: ['Tech'] })], SPECS)
    expect(remaining).toEqual([undefined, 2])
  })

  it('applies rows in the order given, counts included', () => {
    // Rank before a filter is a different question from rank after it, and
    // the row order is how the user says which they meant. The panel this
    // replaced always applied rank last, which quietly overrode them.
    const rank = row({ kind: 'rank', field: 'adv_3m', count: 2 })
    const tech = row({ field: 'SECTOR', values: ['Tech'] })

    expect(ids(runRows(POOL, [tech, rank], SPECS).matched)).toEqual(['A', 'B'])
    // Top two overall are A (900) and C (700); only A is Tech.
    expect(ids(runRows(POOL, [rank, tech], SPECS).matched)).toEqual(['A'])
  })

  it('bounds a numeric row at either end', () => {
    const only = row({ field: 'adv_3m', min: 600 })
    expect(ids(runRows(POOL, [only], SPECS).matched)).toEqual(['A', 'C'])
    expect(ids(runRows(POOL, [row({ field: 'adv_3m', max: 500 })], SPECS).matched)).toEqual([
      'B',
      'D'
    ])
  })

  it('drops a name it cannot rank rather than sorting it to one end', () => {
    const pool: Candidate[] = [...POOL, { identifier: 'E', fields: { SECTOR: 'Tech' } }]
    const rank = row({ kind: 'rank', field: 'adv_3m', count: 10 })
    expect(ids(runRows(pool, [rank], filtersFor(pool)).matched)).not.toContain('E')
  })
})

describe('isComplete', () => {
  it('needs a dimension before anything else', () => {
    expect(isComplete(row({ values: ['Tech'] }), SPECS)).toBe(false)
  })

  it('needs a count on a rank row, and a numeric field to rank by', () => {
    expect(isComplete(row({ kind: 'rank', field: 'adv_3m' }), SPECS)).toBe(false)
    expect(isComplete(row({ kind: 'rank', field: 'adv_3m', count: 5 }), SPECS)).toBe(true)
    expect(isComplete(row({ kind: 'rank', field: 'SECTOR', count: 5 }), SPECS)).toBe(false)
  })
})

describe('describeRow', () => {
  it('reads as a sentence, so the row says what it does', () => {
    expect(describeRow(row({ field: 'SECTOR', values: ['Tech', 'Health'] }), SPECS)).toBe(
      'Sector is Tech or Health'
    )
    expect(describeRow(row({ kind: 'rank', field: 'adv_3m', count: 10 }), SPECS)).toBe(
      'top 10 by Adv 3m'
    )
    expect(describeRow(row({ field: 'adv_3m', min: 600 }), SPECS)).toBe('Adv 3m at least 600')
  })

  it('asks for what it is missing', () => {
    expect(describeRow(row(), SPECS)).toBe('Choose a dimension')
  })
})
