import { describe, expect, it } from 'vitest'
import type { BacktestOptions } from '../shared/strategyDocuments'
import { DEFAULT_SETUP, setupFindings, toRequest, type BacktestSetup } from './setup'

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
      key: 'ucits_etf',
      name: 'UCITS ETF',
      archetype: 'exchange_traded',
      settings: { management_fee_bps: 0, creation_unit: 50000 }
    }
  ],
  vehicle_settings: [
    param('management_fee_bps', 'number'),
    param('creation_unit', 'integer', { applies_to: ['exchange_traded'] }),
    param('pricing', 'json')
  ],
  share_class_settings: [
    param('name', 'string'),
    param('currency', 'string'),
    param('hedged', 'boolean')
  ],
  flows: [{ name: 'PeriodicFlows', label: 'Periodic', parameters: [param('fraction', 'number')] }],
  modelling_assumptions: [param('cash_rate', 'number')]
} as unknown as BacktestOptions

function setup(patch: Partial<BacktestSetup>): BacktestSetup {
  return { ...DEFAULT_SETUP, ...patch }
}

describe('the backtest request (0.9.0)', () => {
  it('is a plain run with the defaults alone', () => {
    expect(toRequest(DEFAULT_SETUP, OPTIONS)).toEqual({
      transaction_cost_bps: 5,
      initial_capital: 1_000_000,
      dividends: 'reinvest'
    })
  })

  it('sends a preset with only the settings changed on it', () => {
    const body = toRequest(
      setup({ preset: 'ucits_etf', vehicle: { management_fee_bps: '20', creation_unit: '50000' } }),
      OPTIONS
    )
    // The creation unit was typed as the preset already has it, so it stays.
    expect(body.vehicle).toEqual({ preset: 'ucits_etf', settings: { management_fee_bps: 20 } })
  })

  it('gives each class its capital and its flows, by name', () => {
    const body = toRequest(
      setup({
        classes: [
          { key: 'a', values: { name: 'A' }, capital: '300' },
          { key: 'b', values: { name: 'B', currency: 'EUR', hedged: 'true' }, capital: '100' }
        ],
        flows: [
          {
            key: 'f',
            type: 'PeriodicFlows',
            shareClass: 'B',
            values: { fraction: '0.02' },
            dated: []
          },
          {
            key: 'g',
            type: 'DatedFlows',
            shareClass: '',
            values: {},
            dated: [
              { date: '2024-03-01', amount: '250' },
              { date: '', amount: '1' }
            ]
          }
        ]
      }),
      OPTIONS
    )

    expect(body.initial_capital).toEqual({ A: 300, B: 100 })
    expect(body.share_classes).toEqual([
      { name: 'A' },
      { name: 'B', currency: 'EUR', hedged: true }
    ])
    // An unnamed class goes to the first; a half-filled date row is left out.
    expect(body.flows).toEqual({
      B: [{ type: 'PeriodicFlows', params: { fraction: 0.02 } }],
      A: [{ type: 'DatedFlows', params: { amounts: { '2024-03-01': 250 } } }]
    })
  })

  it('sends the assumptions that were set, and none that were not', () => {
    expect(toRequest(setup({ assumptions: { cash_rate: '' } }), OPTIONS)).not.toHaveProperty(
      'modelling_assumptions'
    )
    expect(
      toRequest(setup({ assumptions: { cash_rate: '0.03' } }), OPTIONS).modelling_assumptions
    ).toEqual({ cash_rate: 0.03 })
  })

  it('names a market-series benchmark as one', () => {
    expect(
      toRequest(setup({ benchmark: 'SPX', benchmarkKind: 'identifier' }), OPTIONS).benchmark
    ).toEqual({ id: 'SPX', kind: 'identifier', price_column: 'CLOSE' })
  })
})

describe('what the form refuses before asking', () => {
  it('wants classes named, apart, and a currency for a hedge', () => {
    const findings = setupFindings(
      setup({
        classes: [
          { key: 'a', values: { name: 'A' }, capital: '1' },
          { key: 'b', values: { name: 'A', hedged: 'true' }, capital: '0' }
        ]
      }),
      'tech10'
    )

    expect(findings).toEqual([
      'Each share class needs a different name.',
      'Class A needs initial capital of more than zero.',
      'Class A is hedged, so it needs its own currency.'
    ])
  })

  it('asks for a strategy before anything else', () => {
    expect(setupFindings(DEFAULT_SETUP, '')).toEqual(['Choose a saved strategy to backtest.'])
  })
})
