import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParameterSpec, TypeSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions, StrategyDocument } from '../shared/strategyDocuments'
import { ImplementationCard } from './ImplementationCard'
import { summariseSpec, summariseValues } from './specSummary'

const param = (name: string, label: string, order = 0): ParameterSpec => ({
  name,
  label,
  type: 'number',
  required: false,
  default: null,
  choices: null,
  help: '',
  unit: null,
  order
})

const MINIMUM_PRICE: TypeSpec = {
  name: 'MinimumPriceScreen',
  label: 'Minimum price',
  summary: 'Drops names priced below a floor.',
  parameters: [param('min_price', 'Minimum price', 0), param('exit', 'Exit price', 1)]
}

describe("a strategy setting's line (Karan, 2026-10-19)", () => {
  it("lists what is set, in the catalogue's order, by its label", () => {
    expect(
      summariseSpec([MINIMUM_PRICE], {
        type: 'MinimumPriceScreen',
        params: { exit: 4, min_price: 5 }
      })
    ).toBe('Minimum price 5 · Exit price 4')
  })

  it('reads "Engine defaults" when nothing is set', () => {
    expect(summariseValues([param('cash_buffer', 'Cash buffer')], {})).toBe('Engine defaults')
  })
})

describe('the implementation as rows, as Index Definition draws its methodology', () => {
  const options = {
    screens: [MINIMUM_PRICE],
    caps: [],
    implementation_settings: [param('cash_buffer', 'Cash buffer')]
  } as unknown as BacktestOptions
  const document: StrategyDocument = {
    id: 'S',
    name: 'S',
    index_id: 'TECH10',
    implementation: {
      screens: [{ type: 'MinimumPriceScreen', params: { min_price: 5 } }],
      cash_buffer: 0.02,
      invest_flows: 'target',
      redistribution: 'pro_rata'
    }
  }

  it('shows each screen as a row with its type and settings, under its group', () => {
    render(<ImplementationCard document={document} onChange={vi.fn()} options={options} />)

    expect(screen.getByText('Screens · which names may be held')).toBeInTheDocument()
    expect(screen.getByText('Minimum price 5')).toBeInTheDocument()
    expect(screen.getByText('Cash and flows', { selector: 'h4' })).toBeInTheDocument()
    expect(screen.getByText('Cash buffer 0.02')).toBeInTheDocument()
  })

  it('opens a row to edit it, and takes a screen out from its row', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ImplementationCard document={document} onChange={onChange} options={options} />)

    await user.click(screen.getByText('Minimum price 5'))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Minimum price' }))
    const change = onChange.mock.lastCall?.[0] as (current: StrategyDocument) => StrategyDocument
    expect(change(document).implementation?.screens).toEqual([])
  })
})
