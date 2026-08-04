import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import { IndexDefinitionView } from './IndexDefinitionView'
import type { IndexDocument } from './pipeline'

const SAVED: IndexDocument = {
  id: 'TECH10',
  name: 'Beacon US Technology Top 10',
  currency: 'USD',
  base_date: '2019-12-31',
  base_value: 100,
  rebalancing_frequency: 'QUARTERLY',
  return_type: 'PRICE',
  rebalance_day_rule: 'FIRST_BUSINESS_DAY',
  effective_lag_sessions: 0,
  withholding_tax_rate: 0,
  universe: { universe_id: 'US-LARGECAP' },
  pipeline: {
    selection: [
      { id: 'r1', type: 'FilterRule', params: { sector: 'Information Technology' } },
      { id: 'r2', type: 'SelectionRule', params: { top: 10 } }
    ],
    weighting: { id: 'weighting', scheme: 'MarketCapWeighted', max_weight: 0.2 },
    treatment: { corporate_actions: 'ADJUST_DIVISOR' }
  }
}

interface Calls {
  saved: IndexDocument[]
  validated: IndexDocument[]
  /** The DRAFT documents preview was asked to resolve, since BN-120. */
  previewed: IndexDocument[]
}

function mount(overrides: { validate?: unknown; save?: unknown } = {}): Calls {
  const calls: Calls = { saved: [], validated: [], previewed: [] }
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } }
  })

  const client = {
    indices: {
      get: () => Promise.resolve(SAVED),
      save: (_id: string, document: IndexDocument) => {
        calls.saved.push(document)
        const reply = overrides.save
        if (reply instanceof Error) return Promise.reject(reply)
        return Promise.resolve({ index: document, findings: [] })
      },
      create: (document: IndexDocument) => {
        calls.saved.push(document)
        return Promise.resolve({ index: document, findings: [] })
      },
      validate: (document: IndexDocument) => {
        calls.validated.push(document)
        return Promise.resolve(overrides.validate ?? { valid: true, findings: [] })
      },
      previewDocument: ({ document }: { document: IndexDocument }) => {
        calls.previewed.push(document)
        return Promise.resolve({
          index_id: document.id,
          as_of: '2026-07-22',
          assets: [
            { identifier: 'AAPL', included: true, capped: true, weight: 0.2 },
            { identifier: 'MSFT', included: true, capped: false, weight: 0.15 }
          ],
          steps: [
            { position: 0, remaining: 512 },
            { position: 1, rule_id: 'r1', rule_type: 'FilterRule', remaining: 87 }
          ],
          weights: { AAPL: 0.2, MSFT: 0.15 },
          total_weight: 1,
          cap: 0.2,
          cap_redistributed: 0.031
        })
      }
    },
    universes: {
      list: () => Promise.resolve({ universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: ['AAPL', 'MSFT'] })
    },
    data: { reference: () => Promise.resolve({ identifier: 'x', fields: {} }) }
  } as unknown as BeaconClient

  const tab = useWorkspace.getState().tabs.find((candidate) => candidate.id === 'tech10')
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <IndexDefinitionView tab={tab!} subject={undefined} />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
  return calls
}

beforeEach(() => {
  localStorage.clear()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'tech10',
    page: 'strategy-builder',
    viewKind: 'index-definition',
    archetype: 'document',
    title: 'TECH10'
  })
})

describe('the document lifecycle', () => {
  it('opens clean — an untouched draft is not an unsaved change', async () => {
    mount()
    await screen.findByLabelText('Name')

    expect(useWorkspace.getState().tabs[0]?.dirty).toBe(false)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('marks the TAB dirty, because the tab is what draws it', async () => {
    mount()
    await userEvent.type(await screen.findByLabelText('Name'), '!')

    // Dirty lives in the workspace store, not here: the tab strip is nowhere
    // near this view and taxonomy §1 gives dirty to documents.
    await waitFor(() => {
      expect(useWorkspace.getState().tabs[0]?.dirty).toBe(true)
    })
  })

  it('reverts to what the engine holds', async () => {
    mount()
    const name = await screen.findByLabelText('Name')
    await userEvent.type(name, '!')

    await userEvent.click(screen.getByRole('button', { name: 'Revert' }))

    expect(name).toHaveValue(SAVED.name)
    await waitFor(() => {
      expect(useWorkspace.getState().tabs[0]?.dirty).toBe(false)
    })
  })

  it('saves the draft and adopts the result as the new baseline', async () => {
    const calls = mount()
    await userEvent.type(await screen.findByLabelText('Name'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(calls.saved).toHaveLength(1)
    })
    expect(calls.saved[0]?.name).toBe(`${SAVED.name}!`)
    await waitFor(() => {
      expect(useWorkspace.getState().tabs[0]?.dirty).toBe(false)
    })
  })

  it('locks the id of a saved index, since the id is its URL', async () => {
    mount()
    expect(await screen.findByLabelText('Id')).toBeDisabled()
  })
})

describe('the methodology pipeline', () => {
  it('numbers rules across the whole pipeline, not per group', async () => {
    mount()
    await screen.findByText('Selection')

    // A finding that points at "rule 03" must be findable without counting
    // groups, so weighting continues the numbering.
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
  })

  it('offers an add slot under Selection only', async () => {
    mount()
    await screen.findByText('Selection')

    expect(screen.getAllByRole('button', { name: /Add rule/ })).toHaveLength(1)
  })

  it('will not let a weighting or treatment row be removed', async () => {
    mount()
    await screen.findByText('Weighting & caps')

    // Both are fields on the document, not rules — py-beacon has nowhere to
    // put a third weighting.
    expect(screen.queryByRole('button', { name: 'Remove weighting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove treatment' })).not.toBeInTheDocument()
  })

  it('adds a rule and opens nothing until it is clicked', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Add rule/ }))

    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rule type')).not.toBeInTheDocument()
  })

  it('edits a rule through the inline editor', async () => {
    mount()
    await userEvent.click(await screen.findByText('Sector Information Technology'))

    const type = screen.getByLabelText('Rule type')
    await userEvent.clear(type)
    await userEvent.type(type, 'LiquidityRule')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByText('LiquidityRule')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rule type')).not.toBeInTheDocument()
  })

  it('reorders, because order changes the index', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Move r2 up' }))

    const badges = [...document.querySelectorAll('.methodology-row .badge')].map(
      (badge) => badge.textContent
    )
    expect(badges.slice(0, 2)).toEqual(['SelectionRule', 'FilterRule'])
  })

  it('removes a rule', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove r1' }))

    expect(screen.queryByText('Sector Information Technology')).not.toBeInTheDocument()
  })
})

describe('validation', () => {
  it('validates AND previews the draft, not the saved index', async () => {
    const calls = mount()
    await userEvent.type(await screen.findByLabelText('Name'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(calls.validated).toHaveLength(1)
    })
    // Both take a body since BN-120. Preview used to take an id and could
    // only ever describe what was stored.
    expect(calls.validated[0]?.name).toBe(`${SAVED.name}!`)
    expect(calls.previewed[0]?.name).toBe(`${SAVED.name}!`)
  })

  it('attaches preview counts to the rule that produced them', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Validate' }))

    expect(await screen.findByText('87 pass')).toBeInTheDocument()
  })

  it('says the figures are out of date once the draft moves past them', async () => {
    // Narrower than it used to be: preview can see the draft now, so this
    // only means it has not been re-run — not that it cannot see it at all.
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Validate' }))
    await screen.findByText('87 pass')

    await userEvent.type(screen.getByLabelText('Name'), '!')

    expect(screen.getByText(/draft has changed since these were resolved/)).toBeInTheDocument()
  })

  it('shows blocking findings apart from advisory ones', async () => {
    mount({
      validate: {
        valid: false,
        findings: [
          { code: 'E1', message: 'no rules', path: 'pipeline.selection', severity: 'error' },
          { code: 'W1', message: 'wide cap', path: 'pipeline.weighting', severity: 'warning' }
        ]
      }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Validate' }))

    expect(await screen.findByText('blocked')).toBeInTheDocument()
    expect(screen.getByText(/no rules/).closest('ul')).toHaveClass('validation-errors')
    expect(screen.getByText(/wide cap/).closest('ul')).toHaveClass('validation-warnings')
  })
})
