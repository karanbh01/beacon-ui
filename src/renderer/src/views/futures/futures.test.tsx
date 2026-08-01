import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { FuturesPricerView } from './FuturesPricerView'
import { carryRows, costOfCarry, money, rate } from './futures'

describe('costOfCarry', () => {
  it('is S·e^((r−q)T), which is what BU-31 says the pane must match', () => {
    const spot = 341.34
    const expected = spot * Math.exp((0.04 - 0.012) * 0.25)
    expect(costOfCarry(spot, 0.04, 0.012, 0.25)).toBeCloseTo(expected, 10)
  })

  it('subtracts borrow alongside the dividend yield', () => {
    expect(costOfCarry(100, 0.05, 0.01, 1, 0.02)).toBeCloseTo(100 * Math.exp(0.02), 10)
  })

  it('is the spot itself at zero tenor', () => {
    expect(costOfCarry(100, 0.05, 0.01, 0)).toBeCloseTo(100, 10)
  })
})

describe('carryRows', () => {
  const carry = { financing: 3.4, dividend: -1.02, borrow: 0, residual: 0.04, total: 2.42 }

  it('shows the residual rather than folding it away', () => {
    // py-beacon documents it as compounding the decomposition cannot
    // attribute, so hiding it would make three parts appear to sum exactly
    // to a total they do not.
    expect(carryRows(carry).map((row) => row.label)).toEqual([
      'Financing',
      'Dividend',
      'Borrow',
      'Residual',
      'Total'
    ])
  })

  it('gives the residual no tone — it is not a gain or a loss', () => {
    expect(carryRows(carry).find((row) => row.label === 'Residual')?.tone).toBe('default')
  })

  it('colours a dividend as the reduction it always is', () => {
    expect(carryRows(carry).find((row) => row.label === 'Dividend')?.tone).toBe('negative')
  })
})

describe('formatting', () => {
  it('says nothing rather than NaN', () => {
    expect(money(undefined)).toBe('—')
    expect(money(null)).toBe('—')
    expect(rate(Number.NaN)).toBe('—')
  })

  it('renders a rate as a percentage', () => {
    expect(rate(0.0435)).toBe('4.35%')
  })
})

/** py-beacon's own answer, so the test exercises the wiring not the maths. */
function priced(body: Record<string, unknown>): unknown {
  const spot = Number(body.spot)
  const r = Number(body.risk_free_rate)
  const q = Number(body.dividend_yield)
  const t = Number(body.time_to_expiry)
  const fair = costOfCarry(spot, r, q, t)

  return {
    fair_value: fair,
    contract_value: fair * Number(body.contract_multiplier) * Number(body.contracts),
    financing_rate: r,
    time_to_expiry: t,
    market_price: body.market_price ?? null,
    basis: body.market_price === undefined ? null : Number(body.market_price) - fair,
    implied_repo: body.market_price === undefined ? null : 0.041,
    carry: {
      financing: spot * r * t,
      dividend: -spot * q * t,
      borrow: 0,
      residual: fair - spot - spot * r * t + spot * q * t,
      total: fair - spot
    },
    sensitivity: { index: [], columns: [], data: [] }
  }
}

/** The rendered "Fair value" cell, which is what the acceptance is about. */
function fairValue(): string | undefined {
  const label = [...document.querySelectorAll('.field-row-label')].find(
    (node) => node.textContent === 'Fair value'
  )
  return label?.parentElement?.querySelector('.field-row-value')?.textContent ?? undefined
}

const LOADED = money(costOfCarry(341.34, 0.04, 0.012, 0.25))

function mount(): { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  const client = {
    write: (_method: string, _path: string, options: { body: Record<string, unknown> }) => {
      bodies.push(options.body)
      return Promise.resolve(priced(options.body))
    }
  } as unknown as BeaconClient

  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <FuturesPricerView />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
  return { bodies }
}

describe('the futures pricer (BU-31 acceptance)', () => {
  it('prices on load and shows the carry decomposition', async () => {
    mount()

    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })
    expect(screen.getByText('Carry decomposition')).toBeInTheDocument()
    expect(screen.getByText('Financing')).toBeInTheDocument()
  })

  it('moves the carry decomposition when spot moves — BU-31’s acceptance', async () => {
    mount()
    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })
    // Financing scales with spot; the residual is tiny at both and rounds to
    // the same two decimals, so it would not show the move.
    const before = screen.getByText('Financing').nextElementSibling?.textContent

    const spot = screen.getByLabelText('Spot')
    await userEvent.clear(spot)
    await userEvent.type(spot, '400')

    const expected = money(costOfCarry(400, 0.04, 0.012, 0.25))
    await waitFor(() => {
      expect(fairValue()).toBe(expected)
    })
    // The whole decomposition moved, not just the headline.
    expect(screen.getByText('Financing').nextElementSibling?.textContent).not.toBe(before)
  })

  it('sends rates as decimals though the form reads percent', async () => {
    // A desk quotes 4.00%; py-beacon takes 0.04. Converting in five places
    // would eventually mean converting in four.
    const { bodies } = mount()
    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })

    expect(bodies[0]).toMatchObject({ risk_free_rate: 0.04, dividend_yield: 0.012 })
  })

  it('debounces, so typing a number is one request rather than five', async () => {
    const { bodies } = mount()
    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })
    const before = bodies.length

    const spot = screen.getByLabelText('Spot')
    await userEvent.clear(spot)
    await userEvent.type(spot, '212.50')

    await waitFor(() => {
      expect(fairValue()).toBe(money(costOfCarry(212.5, 0.04, 0.012, 0.25)))
    })

    // Six keystrokes plus a clear, and at most a couple of requests.
    expect(bodies.length - before).toBeLessThan(4)
  })

  it('leaves basis and implied repo empty without a quote', async () => {
    // Computing them against the theoretical value would make both
    // identically zero, which looks like an answer.
    mount()
    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })

    expect(screen.getAllByText('no quote')).toHaveLength(2)
  })

  it('computes a basis once a market price is given', async () => {
    mount()
    await waitFor(() => {
      expect(fairValue()).toBe(LOADED)
    })

    await userEvent.type(screen.getByLabelText('Market price'), '345')

    await waitFor(() => {
      expect(screen.queryAllByText('no quote')).toHaveLength(0)
    })
    expect(screen.getByText('4.10%')).toBeInTheDocument()
  })
})
