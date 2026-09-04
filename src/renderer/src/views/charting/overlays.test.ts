import { describe, expect, it } from 'vitest'
import { eventText, eventsFrom, seriesFrom } from './useChartOverlays'
import type { CorporateAction } from '../corporate-actions/actions'
import type { FeatureHistoryRow } from '../features/features'

const ACTIONS: CorporateAction[] = [
  { ex_date: '2026-05-09', type: 'DIVIDEND', kind: 'cash', value: 0.26 },
  { ex_date: '2025-08-31', type: 'SPLIT', kind: 'ratio', value: 4 },
  { ex_date: '2026-03-02', type: 'SPIN_OFF', kind: 'structural', value: 0 }
] as CorporateAction[]

const ROWS: FeatureHistoryRow[] = [
  {
    key: '0',
    date: '2026-07-31',
    dataset: 'fundamentals',
    field: 'eps',
    value: 16.6,
    detail: undefined
  },
  {
    key: '1',
    date: '2026-04-30',
    dataset: 'fundamentals',
    field: 'eps',
    value: 15.2,
    detail: undefined
  },
  {
    key: '2',
    date: '2026-04-30',
    dataset: 'fundamentals',
    field: 'pe_ratio',
    value: 10.4,
    detail: undefined
  },
  {
    key: '3',
    date: '2025-01-31',
    dataset: 'fundamentals',
    field: 'eps',
    value: 9,
    detail: undefined
  },
  {
    key: '4',
    date: '2026-01-31',
    dataset: 'fundamentals',
    field: 'eps',
    value: null,
    detail: undefined
  }
]

describe('corporate actions on the axis (BU-152)', () => {
  it('says what happened in the few words a flag has room for', () => {
    expect(eventText(ACTIONS[0]!)).toBe('Dividend 0.26')
    expect(eventText(ACTIONS[1]!)).toBe('4:1 Split')
    // Structural carries no aggregable value, so the flag states no number.
    expect(eventText(ACTIONS[2]!)).toBe('Spin off')
  })

  it('takes the kind, never the type string, for the shape', () => {
    const drawn = eventsFrom(ACTIONS, undefined)
    // Oldest first: the split, then the spin-off, then the dividend.
    expect(drawn.map((event) => event.shape)).toEqual(['square', 'arrowUp', 'circle'])
  })

  it('drops what happened before the window being drawn', () => {
    const drawn = eventsFrom(ACTIONS, '2026-01-01')
    expect(drawn.map((event) => event.date)).toEqual(['2026-03-02', '2026-05-09'])
  })

  it('has nothing to draw for an instrument with no actions', () => {
    expect(eventsFrom(undefined, undefined)).toEqual([])
  })
})

describe('a feature as a series (BU-152)', () => {
  it('takes one field, oldest first, inside the window', () => {
    expect(seriesFrom(ROWS, 'eps', '2026-01-01')).toEqual([
      { date: '2026-04-30', value: 15.2 },
      { date: '2026-07-31', value: 16.6 }
    ])
  })

  it('leaves a null as a gap rather than plotting it as zero', () => {
    const drawn = seriesFrom(ROWS, 'eps', undefined)
    expect(drawn.map((point) => point.date)).not.toContain('2026-01-31')
  })

  it('knows a field it has no history for', () => {
    expect(seriesFrom(ROWS, 'x_sentiment', undefined)).toEqual([])
  })
})
