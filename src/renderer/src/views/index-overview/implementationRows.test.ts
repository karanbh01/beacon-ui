import { describe, expect, it } from 'vitest'
import { fillRatio, stepRows } from './implementationRows'

const LABELS: Record<string, string> = {
  MinimumPriceScreen: 'Minimum price',
  ExclusionScreen: 'Exclusions'
}
const labelOf = (stage: string): string => LABELS[stage] ?? stage

describe('a rebalance as the implementation carried it out', () => {
  it('joins the steps, the pricing and the unfilled orders by date', () => {
    const rows = stepRows(
      [
        {
          date: '2023-01-20',
          removed: {
            CMPF: 'MinimumPriceScreen',
            CMPH: 'MinimumPriceScreen',
            CMPA: 'ExclusionScreen'
          },
          capped: { CMPE: 0.03 },
          cash_weight: 0.02
        },
        { date: '2023-04-21', removed: {}, capped: {}, cash_weight: 0 }
      ],
      [
        { date: '2023-01-20', priced_from: '2023-01-20' },
        // A schedule that landed on a shut market: the case worth reading.
        { date: '2023-04-21', priced_from: '2023-04-20' }
      ],
      [
        {
          date: '2023-01-20',
          asset_id: 'CMPE',
          requested_quantity: 100,
          filled_quantity: 40,
          price: null,
          shortfall_value: null,
          reason: 'execution limit'
        }
      ],
      labelOf
    )

    expect(rows).toEqual([
      {
        date: '2023-01-20',
        pricedFrom: undefined,
        removed: 3,
        removedBy: '2 Minimum price · 1 Exclusions',
        capped: 1,
        cashWeight: 0.02,
        unfilled: 1
      },
      {
        date: '2023-04-21',
        pricedFrom: '2023-04-20',
        removed: 0,
        removedBy: '',
        capped: 0,
        cashWeight: 0,
        unfilled: 0
      }
    ])
  })

  it('reads a fill as a share of the order, and none of nothing', () => {
    const order = {
      date: '2023-01-20',
      asset_id: 'X',
      requested_quantity: 200,
      filled_quantity: 50,
      price: 1,
      shortfall_value: 150,
      reason: 'cash'
    }
    expect(fillRatio(order)).toBe(0.25)
    expect(fillRatio({ ...order, requested_quantity: 0 })).toBeUndefined()
  })
})
