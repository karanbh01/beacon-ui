import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  checkManual,
  combine,
  emptyFilters,
  filtersFor,
  labelFor,
  noneChosen,
  type Candidate
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

describe('applyFilters', () => {
  it('returns everything when nothing is chosen', () => {
    expect(applyFilters(POOL, emptyFilters())).toHaveLength(4)
  })

  it('narrows by a category', () => {
    const filters = { ...emptyFilters(), categories: { SECTOR: ['Tech'] } }
    expect(ids(applyFilters(POOL, filters))).toEqual(['A', 'B'])
  })

  it('treats several chosen values as OR within one filter', () => {
    const filters = { ...emptyFilters(), categories: { SECTOR: ['Tech', 'Health'] } }
    expect(ids(applyFilters(POOL, filters))).toEqual(['A', 'B', 'D'])
  })

  it('treats separate filters as AND', () => {
    const filters = {
      ...emptyFilters(),
      categories: { SECTOR: ['Tech'], EXCHANGE: ['XNAS'] }
    }
    expect(ids(applyFilters(POOL, filters))).toEqual(['A'])
  })

  it('narrows by a numeric range, either end optional', () => {
    expect(
      ids(applyFilters(POOL, { ...emptyFilters(), ranges: { adv_3m: { min: 600 } } }))
    ).toEqual(['A', 'C'])
    expect(
      ids(applyFilters(POOL, { ...emptyFilters(), ranges: { adv_3m: { max: 600 } } }))
    ).toEqual(['B', 'D'])
  })

  it('ranks LAST, so "top 2 tech" is of the tech names', () => {
    // The other order asks a different and almost always unintended question.
    const filters = {
      ...emptyFilters(),
      categories: { SECTOR: ['Tech'] },
      rank: { field: 'adv_3m', count: 2, direction: 'top' as const }
    }
    expect(ids(applyFilters(POOL, filters))).toEqual(['A', 'B'])
  })

  it('ranks top and bottom', () => {
    const top = {
      ...emptyFilters(),
      rank: { field: 'adv_3m', count: 2, direction: 'top' as const }
    }
    const bottom = {
      ...emptyFilters(),
      rank: { field: 'adv_3m', count: 2, direction: 'bottom' as const }
    }
    expect(ids(applyFilters(POOL, top))).toEqual(['A', 'C'])
    expect(ids(applyFilters(POOL, bottom))).toEqual(['D', 'B'])
  })

  it('drops names that cannot be ranked rather than guessing a value for them', () => {
    const ragged = [...POOL, { identifier: 'E', fields: { SECTOR: 'Tech' } }]
    const filters = {
      ...emptyFilters(),
      rank: { field: 'adv_3m', count: 9, direction: 'top' as const }
    }
    expect(ids(applyFilters(ragged, filters))).not.toContain('E')
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

describe('noneChosen', () => {
  it('is true for an untouched state, so the builder starts empty', () => {
    // The difference between a filter and a builder: opening the form must
    // not pre-select all 500 names in the dataset.
    expect(noneChosen(emptyFilters())).toBe(true)
  })

  it('is false once anything is set, including a rank on its own', () => {
    expect(noneChosen({ categories: { SECTOR: ['Energy'] }, ranges: {} })).toBe(false)
    expect(noneChosen({ categories: {}, ranges: { adv_3m: { min: 1 } } })).toBe(false)
    expect(
      noneChosen({
        categories: {},
        ranges: {},
        rank: { field: 'adv_3m', count: 100, direction: 'top' }
      })
    ).toBe(false)
  })

  it('ignores a cleared choice, which is not a choice', () => {
    expect(noneChosen({ categories: { SECTOR: [] }, ranges: { adv_3m: {} } })).toBe(true)
  })
})
