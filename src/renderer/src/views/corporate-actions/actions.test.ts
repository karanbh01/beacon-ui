import { describe, expect, it } from 'vitest'
import {
  amountLabel,
  describeAction,
  filterByType,
  formatDate,
  isRatio,
  isStructural,
  nextExDate,
  payDateLabel,
  statusLabel,
  percent,
  ratioLabel,
  sortNewestFirst,
  typeLabel,
  typesIn,
  type CorporateAction
} from './actions'

// `kind` is required since BN-118 — the engine states what `value` means
// rather than leaving the client to infer it from the type string.
const DIVIDEND: CorporateAction = {
  ex_date: '2026-05-09',
  type: 'DIVIDEND',
  kind: 'cash',
  value: 0.26
}
const SPLIT: CorporateAction = { ex_date: '2020-08-31', type: 'SPLIT', kind: 'ratio', value: 4 }
const REVERSE: CorporateAction = {
  ex_date: '2023-01-04',
  type: 'REVERSE_SPLIT',
  kind: 'ratio',
  value: 0.1
}
const UPCOMING: CorporateAction = {
  ex_date: '2026-08-11',
  type: 'DIVIDEND',
  kind: 'cash',
  value: 0.27
}

describe('isRatio', () => {
  it('reads the engine rather than the type string', () => {
    expect(isRatio(SPLIT)).toBe(true)
    expect(isRatio(DIVIDEND)).toBe(false)
  })

  it('believes `kind` even when the type name suggests otherwise', () => {
    // The old guess matched the word "split" and would have called this a
    // ratio. That is the failure BN-118 removes: a wrong number rather than
    // a missing one, with nothing to flag it.
    const oddity: CorporateAction = {
      ex_date: '2026-01-05',
      type: 'SPLIT_OFF',
      kind: 'structural',
      value: 1
    }

    expect(isRatio(oddity)).toBe(false)
    expect(isStructural(oddity)).toBe(true)
  })
})

describe('structural actions', () => {
  const SPINOFF: CorporateAction = {
    ex_date: '2026-03-02',
    type: 'SPIN_OFF',
    kind: 'structural',
    value: 1
  }

  it('shows no quantity, because `value` is not one in either column', () => {
    expect(amountLabel(SPINOFF)).toBe('—')
    expect(describeAction(SPINOFF)).toBe('Spin off')
  })
})

describe('payDateLabel and statusLabel', () => {
  it('render what BN-118 added', () => {
    const paid: CorporateAction = {
      ex_date: '2026-05-09',
      pay_date: '2026-05-23',
      status: 'paid',
      type: 'DIVIDEND',
      kind: 'cash',
      value: 0.26
    }

    expect(payDateLabel(paid)).toBe('23 May 2026')
    expect(statusLabel(paid)).toBe('Paid')
  })

  it('say nothing when the action has not settled', () => {
    // Absent is a real state for an announced action, not a missing field.
    expect(payDateLabel(DIVIDEND)).toBe('—')
    expect(statusLabel(DIVIDEND)).toBe('—')
  })
})

describe('typeLabel', () => {
  it('reads as a word, not a constant', () => {
    expect(typeLabel('DIVIDEND')).toBe('Dividend')
    expect(typeLabel('REVERSE_SPLIT')).toBe('Reverse split')
  })

  it('leaves a type it cannot title-case alone', () => {
    expect(typeLabel('_')).toBe('_')
  })
})

describe('ratioLabel', () => {
  it('renders a multiplier as the ratio a reader recognises', () => {
    expect(ratioLabel(4)).toBe('4:1')
    expect(ratioLabel(0.1)).toBe('1:10')
  })

  it('keeps a 3-for-2 as 1.5:1 rather than rounding it into a different split', () => {
    expect(ratioLabel(1.5)).toBe('1.5:1')
  })

  it('says nothing for a multiplier that cannot be one', () => {
    expect(ratioLabel(0)).toBe('—')
    expect(ratioLabel(Number.NaN)).toBe('—')
  })
})

describe('describeAction and amountLabel', () => {
  it('never sums cash and ratios into one column', () => {
    expect(amountLabel(DIVIDEND)).toBe('0.26')
    expect(amountLabel(SPLIT)).toBe('×4')
  })

  it('spells out what the action did', () => {
    expect(describeAction(SPLIT)).toBe('4:1 Split')
    expect(describeAction(REVERSE)).toBe('1:10 Reverse split')
    expect(describeAction(DIVIDEND)).toContain('per share')
  })
})

describe('sortNewestFirst', () => {
  it('orders by ex-date descending and does not mutate its input', () => {
    const input = [SPLIT, UPCOMING, DIVIDEND]
    const sorted = sortNewestFirst(input)

    expect(sorted.map((action) => action.ex_date)).toEqual([
      '2026-08-11',
      '2026-05-09',
      '2020-08-31'
    ])
    expect(input[0]).toBe(SPLIT)
  })
})

describe('typesIn and filterByType', () => {
  it('lists each type once', () => {
    expect(typesIn([DIVIDEND, SPLIT, UPCOMING])).toEqual(['DIVIDEND', 'SPLIT'])
  })

  it('returns everything when no type is chosen', () => {
    expect(filterByType([DIVIDEND, SPLIT], undefined)).toHaveLength(2)
  })

  it('filters to the chosen type', () => {
    expect(filterByType([DIVIDEND, SPLIT, UPCOMING], 'DIVIDEND')).toEqual([DIVIDEND, UPCOMING])
  })
})

describe('nextExDate', () => {
  it('picks the soonest action still ahead of today', () => {
    const later: CorporateAction = {
      ex_date: '2026-11-10',
      type: 'DIVIDEND',
      kind: 'cash',
      value: 0.27
    }
    expect(nextExDate([DIVIDEND, UPCOMING, later], '2026-07-28')).toBe(UPCOMING)
  })

  it('reports nothing rather than inventing one when the engine sent no future action', () => {
    // The window is deliberately not pushed into the future: py-beacon's
    // trailing dividend is computed to the as-of date, so a future `end`
    // would silently move that window off the present.
    expect(nextExDate([DIVIDEND, SPLIT], '2026-07-28')).toBeUndefined()
  })

  it('ignores an ex-date that is today', () => {
    expect(nextExDate([UPCOMING], '2026-08-11')).toBeUndefined()
  })
})

describe('percent', () => {
  it('renders py-beacon fractions as percentages', () => {
    expect(percent(0.0049)).toBe('0.49%')
  })

  it('says nothing when there was no price to divide by', () => {
    expect(percent(null)).toBe('—')
    expect(percent(undefined)).toBe('—')
  })
})

describe('formatDate', () => {
  it('renders an ISO date', () => {
    expect(formatDate('2026-08-11')).toBe('11 Aug 2026')
  })

  it('falls back to the raw date rather than showing "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})
