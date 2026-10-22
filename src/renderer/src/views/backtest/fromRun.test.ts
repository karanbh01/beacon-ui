import { describe, expect, it } from 'vitest'
import type { BacktestOptions } from '../shared/strategyDocuments'
import { setupFromRun } from './fromRun'
import { toRequest } from './setup'

const param = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
  name,
  type,
  required: false,
  default: null,
  label: name,
  order: 0,
  choices: null,
  help: null,
  unit: null,
  applies_to: null,
  ...extra
})

const OPTIONS = {
  presets: [
    {
      key: 'uk_oeic',
      name: 'UK OEIC',
      archetype: 'open_ended',
      settings: { name: 'UK OEIC', management_fee_bps: 0, launch_price: 1 }
    }
  ],
  vehicle_settings: [
    param('management_fee_bps', 'number'),
    param('launch_price', 'number'),
    param('pricing', 'json')
  ],
  share_class_settings: [
    param('name', 'string'),
    param('currency', 'string'),
    param('hedged', 'boolean'),
    param('distribution', 'string')
  ],
  flows: [{ name: 'PeriodicFlows', label: 'Periodic', parameters: [param('fraction', 'number')] }],
  modelling_assumptions: [param('cash_rate', 'number', { default: 0 })]
} as unknown as BacktestOptions

/** A run's resolved settings, as py-beacon 0.9.1 reports them (BN-322). */
const SETTINGS = {
  strategy_id: 'tech10-capped',
  index_id: 'TECH10',
  start: '2023-01-03',
  end: '2025-12-26',
  initial_capital: { A: 300_000_000, B: 100_000_000 },
  transaction_cost_bps: 5,
  benchmark: null,
  currency: null,
  dividends: 'reinvest',
  modelling_assumptions: { cash_rate: 0 },
  strategy: { type: 'index' },
  implementation: { cash_buffer: 0.02 },
  flows: {
    A: [{ type: 'DatedFlows', params: { amounts: { '2024-03-01': 250000 } } }],
    B: [{ type: 'PeriodicFlows', params: { fraction: 0.02 } }]
  },
  share_classes: [
    { name: 'A', currency: null, hedged: false, distribution: 'accumulating' },
    { name: 'B', currency: 'EUR', hedged: true, distribution: 'distributing' }
  ],
  vehicle: {
    preset: 'uk_oeic',
    settings: { name: 'UK OEIC', management_fee_bps: 25, launch_price: 1, pricing: {} }
  }
}

describe('the form as a run left it (BN-322)', () => {
  it('carries the run’s terms into the fields', () => {
    const setup = setupFromRun(SETTINGS, OPTIONS)

    expect(setup).toMatchObject({
      start: '2023-01-03',
      end: '2025-12-26',
      costBps: '5',
      dividends: 'reinvest',
      preset: 'uk_oeic',
      // Only what differs from the preset: the fee was changed, the price was not.
      vehicle: { management_fee_bps: '25' },
      // An assumption at its default is not an edit.
      assumptions: {}
    })
    expect(setup.classes.map((draft) => [draft.values.name, draft.capital])).toEqual([
      ['A', '300000000'],
      ['B', '100000000']
    ])
  })

  it('posts back as the request the run was', () => {
    const body = toRequest(setupFromRun(SETTINGS, OPTIONS), OPTIONS)

    expect(body).toMatchObject({
      start: '2023-01-03',
      end: '2025-12-26',
      transaction_cost_bps: 5,
      initial_capital: SETTINGS.initial_capital,
      vehicle: { preset: 'uk_oeic', settings: { management_fee_bps: 25 } },
      share_classes: [
        { name: 'A', hedged: false, distribution: 'accumulating' },
        { name: 'B', currency: 'EUR', hedged: true, distribution: 'distributing' }
      ],
      flows: SETTINGS.flows
    })
    // The strategy and its implementation are the stored strategy's.
    expect(body).not.toHaveProperty('strategy')
    expect(body).not.toHaveProperty('implementation')
  })

  it('keeps its own defaults where the settings say nothing', () => {
    const setup = setupFromRun({ dividends: 'cash' }, OPTIONS)
    expect(setup).toMatchObject({ dividends: 'cash', costBps: '5', initialCapital: '1000000' })
    // Unsaid before 0.9.6, so today's default rather than a guess.
    expect(setup.reinvestInto).toBe('payer')
    expect(setupFromRun({ reinvest_into: 'holdings' }, OPTIONS).reinvestInto).toBe('holdings')
  })
})
