import { describe, expect, it } from 'vitest'
import { withBacktests } from './indexSuggestions'

const NOW = Date.parse('2026-09-06T12:00:00Z')
const ROWS = [
  { identifier: 'TECH10', name: 'Beacon US Technology Top 10' },
  { identifier: 'EU-VALUE', name: 'Beacon Europe Value' },
  { identifier: 'NEW', name: 'Never run' }
]

describe('the catalogue says what has been back-tested (BU-168)', () => {
  it('dates the run, because the age is the point', () => {
    const rows = withBacktests(ROWS, [{ index_id: 'TECH10', run_at: '2026-09-03T12:00:00Z' }], NOW)

    expect(rows[0]?.name).toBe('Beacon US Technology Top 10 · backtested 3d ago')
  })

  it('says only that it happened when the record carries no time', () => {
    // Records written before BN-162 stamped them. A date invented from the
    // file would be a guess dressed as data.
    const rows = withBacktests(ROWS, [{ index_id: 'EU-VALUE', run_at: null }], NOW)

    expect(rows[1]?.name).toBe('Beacon Europe Value · backtested')
  })

  it('survives a time it cannot read', () => {
    const rows = withBacktests(ROWS, [{ index_id: 'TECH10', run_at: 'not a date' }], NOW)
    expect(rows[0]?.name).toBe('Beacon US Technology Top 10 · backtested')
  })

  it('leaves an index with no record exactly as it was', () => {
    const rows = withBacktests(ROWS, [{ index_id: 'TECH10', run_at: null }], NOW)

    expect(rows[2]).toEqual(ROWS[2])
    expect(rows).toHaveLength(ROWS.length)
  })

  it('names a record for an index the catalogue does not carry, by ignoring it', () => {
    // A deleted definition whose record outlived it: the row cannot be shown
    // without a name, and inventing one would be worse than omitting it.
    const rows = withBacktests(ROWS, [{ index_id: 'GONE', run_at: null }], NOW)

    expect(rows.map((row) => row.identifier)).toEqual(['TECH10', 'EU-VALUE', 'NEW'])
  })

  it('does nothing at all when no backtest has ever run', () => {
    expect(withBacktests(ROWS, [], NOW)).toEqual(ROWS)
  })
})
