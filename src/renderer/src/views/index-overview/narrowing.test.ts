import { describe, expect, it } from 'vitest'
import { describeNarrowing, type CalendarCoverage } from './narrowing'

/**
 * A window the calendar could not cover (BU-205, BN-198).
 *
 * Karan's rule for py-beacon #211 was refuse if empty, report if partial.
 * This is the reporting half, and the whole risk it addresses is silence:
 * the levels really do span the shorter range, so the chart is correct and
 * answers a smaller question than the one asked, with nothing on screen to
 * say so.
 */

const COVERAGE = (over: Partial<CalendarCoverage>): CalendarCoverage => ({
  calendar: 'XTKS',
  requested_start: '1996-01-02',
  requested_end: '1998-12-31',
  covered_start: '1997-01-06',
  covered_end: '1998-12-31',
  trimmed_start: true,
  trimmed_end: false,
  ...over
})

describe('an ordinary run', () => {
  it('says nothing when there is no coverage record', () => {
    // Null is the signal, and a book from a bare level series is always null
    // — no calculation behind it to have narrowed anything.
    expect(describeNarrowing(null)).toBeUndefined()
    expect(describeNarrowing(undefined)).toBeUndefined()
  })

  it('says nothing when a record is present and neither end moved', () => {
    // Defensive rather than expected: py-beacon sends null in this case. If
    // that ever changes, a notice reading "covers X → X, not X → X" is worse
    // than no notice.
    expect(
      describeNarrowing(COVERAGE({ trimmed_start: false, trimmed_end: false }))
    ).toBeUndefined()
  })
})

describe('which end was trimmed, and what to do about it', () => {
  it('names both ranges, so the gap is readable without arithmetic', () => {
    const said = describeNarrowing(COVERAGE({}))
    expect(said).toContain('1997-01-06 → 1998-12-31')
    expect(said).toContain('1996-01-02 → 1998-12-31')
  })

  it('sends a trimmed START to the base date, since those sessions never existed', () => {
    const said = describeNarrowing(COVERAGE({}))
    expect(said).toContain('no sessions that early')
    expect(said).toContain('move the base date to 1997-01-06')
    expect(said).not.toContain('wait')
  })

  it('sends a trimmed END to waiting, since those sessions do not exist YET', () => {
    /*
     * The distinction that earns two flags instead of one `partial`. Same
     * struct, opposite advice: a calendar whose history does not reach is
     * fixed by changing the calendar, and one whose sessions stop is fixed
     * by asking for less or waiting. One sentence would be wrong half the
     * time.
     */
    const said = describeNarrowing(
      COVERAGE({
        calendar: 'XNYS',
        trimmed_start: false,
        trimmed_end: true,
        covered_end: '2027-09-16',
        requested_end: '2030-01-01'
      })
    )
    expect(said).toContain('published no sessions that late')
    expect(said).toContain('on or before 2027-09-16')
    expect(said).not.toContain('base date')
  })

  it('gives both remedies when both ends moved', () => {
    const said = describeNarrowing(COVERAGE({ trimmed_end: true }))
    expect(said).toContain('neither reaches back that far nor publishes that far ahead')
  })

  it('names the calendar, not just the dates', () => {
    // "The calendar does not cover 1995" leaves a reader looking at the base
    // date, which is not the thing that is wrong.
    expect(describeNarrowing(COVERAGE({}))).toContain('XTKS')
  })
})
