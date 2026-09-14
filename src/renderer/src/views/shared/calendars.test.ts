import { describe, expect, it } from 'vitest'
import { calendarGroups, type CalendarOption } from './strategyQueries'

const CALENDARS: CalendarOption[] = [
  { code: '24/7', name: '24/7', region: 'UTC', tz: 'UTC' },
  { code: 'XTKS', name: 'Tokyo Stock Exchange', region: 'Asia', tz: 'Asia/Tokyo' },
  { code: 'XNYS', name: 'New York Stock Exchange', region: 'America', tz: 'America/New_York' },
  { code: 'AIXK', name: 'AIXK', region: 'Asia', tz: 'Asia/Almaty' },
  { code: 'XLON', name: 'London Stock Exchange', region: 'Europe', tz: 'Europe/London' }
]

describe('grouping the calendars (BU-190)', () => {
  it('groups by the region the engine derived, not one decided here', () => {
    /*
     * `region` is the timezone database's noun, computed server-side from
     * the calendar's own tz. A mapping maintained here — "Europe" to
     * "European" — would be eight special cases today and a guess the day
     * the package adds a region nobody anticipated.
     */
    const groups = calendarGroups(CALENDARS)
    expect(groups.map((group) => group.region)).toEqual(['America', 'Asia', 'Europe', 'UTC'])
  })

  it('sorts UTC last, because it is not a place', () => {
    // Two calendars group under a heading that is not a region. Sorted
    // alphabetically it would land between Europe and nothing; sorted last
    // it reads as the exception it is.
    expect(calendarGroups(CALENDARS).at(-1)?.region).toBe('UTC')
  })

  it('orders each region by name, which is what a reader scans', () => {
    const asia = calendarGroups(CALENDARS).find((group) => group.region === 'Asia')
    expect(asia?.options.map((option) => option.code)).toEqual(['AIXK', 'XTKS'])
  })

  it('keeps an uncurated calendar, labelled by its MIC', () => {
    /*
     * `name` falls back to the code server-side, so a calendar nobody has
     * written a display name for is still selectable. The alternative —
     * dropping it — makes a valid value unreachable from the only control
     * that offers them.
     */
    const asia = calendarGroups(CALENDARS).find((group) => group.region === 'Asia')
    expect(asia?.options.map((option) => option.name)).toContain('AIXK')
  })

  it('has nothing to group before the catalogue arrives', () => {
    expect(calendarGroups([])).toEqual([])
  })
})
