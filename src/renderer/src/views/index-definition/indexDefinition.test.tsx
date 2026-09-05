import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ApiError } from '../../api/errors'
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

  it('draws an add slot under every group, as the frame does', async () => {
    mount()
    await screen.findByText('Selection')

    // Figma 322:1553 puts one under each of the three groups.
    expect(screen.getAllByRole('button', { name: /^\+ Add/ })).toHaveLength(3)
  })

  it('makes the slot inert where the document has nowhere to put anything', async () => {
    mount()
    await screen.findByText('Treatment')

    // Selection is a list, so its slot works. Treatment is ONE spec with one
    // supported value — the slot is drawn so the group does not look
    // unfinished, and says why it cannot do anything.
    const slots = screen.getAllByRole('button', { name: /^\+ Add rule/ })
    expect(slots[0]).toBeEnabled()

    const treatment = slots.at(-1)
    expect(treatment).toBeDisabled()
    expect(treatment).toHaveAttribute('title', expect.stringContaining('ADJUST_DIVISOR'))
  })

  it('caps an index from the weighting slot, and refuses a second cap', async () => {
    mount()
    await screen.findByText('Weighting & caps')

    // The fixture is already capped at 20%, so there is nothing to add.
    const cap = screen.getByRole('button', { name: /^\+ Add cap/ })
    expect(cap).toBeDisabled()
    expect(cap).toHaveAttribute('title', expect.stringContaining('Already capped'))
  })

  it('lets the weighting and the treatment be taken out again (BU-160)', async () => {
    mount()
    await screen.findByText('Weighting & caps')

    // Both used to be fixed rows: the app's defaults, shown as decisions the
    // user had made and could not undo.
    await userEvent.click(screen.getByRole('button', { name: 'Remove weighting' }))
    expect(screen.queryByText('Market cap weighted')).not.toBeInTheDocument()

    // And with none chosen, the slot offers the weighting itself.
    expect(screen.getByRole('button', { name: /^\+ Add weighting/ })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove treatment' }))
    // Selection's slot and treatment's read the same; the last one is the
    // treatment group's, and it is live again now that group is empty.
    expect(screen.getAllByRole('button', { name: /^\+ Add rule/ }).at(-1)).toBeEnabled()
  })

  it('holds Validate and Save back while no scheme is chosen (BU-160)', async () => {
    mount()
    await screen.findByText('Weighting & caps')
    await userEvent.click(screen.getByRole('button', { name: 'Remove weighting' }))

    // `scheme` carries min_length 1, so sending this is a 422 against the
    // request body rather than a finding anybody could act on.
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText(/Choose a weighting scheme/)).toBeInTheDocument()
  })

  it('adds a rule and opens nothing until it is clicked', async () => {
    mount()
    await userEvent.click((await screen.findAllByRole('button', { name: /^\+ Add rule/ }))[0]!)

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

  it('closes the inline editor when the row being edited is removed', async () => {
    // BU-77: otherwise the editor stays open over a rule that no longer
    // exists, and Apply writes back a rule the pipeline has dropped.
    mount()
    await userEvent.click(await screen.findByText('Sector Information Technology'))
    expect(screen.getByLabelText('Rule type')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove r1' }))

    expect(screen.queryByLabelText('Rule type')).not.toBeInTheDocument()
  })

  it('keeps the row actions in the tab order so a keyboard can reach them', async () => {
    // They are revealed on hover and selection (BU-77), via opacity rather
    // than `display: none` — which would take them out of the tab order and
    // make removal mouse-only.
    mount()
    const remove = await screen.findByRole('button', { name: 'Remove r1' })

    expect(remove).toBeVisible()
    remove.focus()
    expect(remove).toHaveFocus()
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

/**
 * Opening the view from the sidebar, where there is no document (BU-85).
 *
 * The tab is titled "Index Definition" and carries no subject. That title was
 * being sent as the index id, so the engine was asked for a document whose id
 * contains a space — a 422 once py-beacon enforced the path pattern, and a
 * 404 before it, which this view reads as "a new index". The blank editor
 * that everyone took for the create flow was a misread 404.
 */
function mountFromSidebar(): { asked: string[] } {
  const asked: string[] = []
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } }
  })

  const client = {
    indices: {
      // Whole documents, as `GET /indices` actually returns — a summary here
      // would let the overview read a field the engine always sends.
      list: () => Promise.resolve({ indices: [SAVED] }),
      get: (id: string) => {
        asked.push(id)
        // 404 for an id the engine does not hold, as a real one answers —
        // which is what `useIndexDraft` reads as "this is a new index".
        if (id !== SAVED.id) {
          return Promise.reject(new ApiError(404, { code: 'not_found', message: 'No such index' }))
        }
        return Promise.resolve(SAVED)
      }
    },
    universes: {
      list: () => Promise.resolve({ universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: ['AAPL', 'MSFT'] })
    },
    data: { reference: () => Promise.resolve({ identifier: 'x', fields: {} }) }
  } as unknown as BeaconClient

  useWorkspace.getState().openTab({
    id: 'sidebar-def',
    page: 'strategy-builder',
    viewKind: 'index-definition',
    archetype: 'document',
    title: 'Index Definition'
  })
  const tab = useWorkspace.getState().tabs.find((candidate) => candidate.id === 'sidebar-def')

  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <IndexDefinitionView tab={tab!} subject={undefined} />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
  return { asked }
}

describe('opened with no document', () => {
  it('never asks the engine for an index named after the view', async () => {
    const { asked } = mountFromSidebar()
    await screen.findByText(SAVED.name)

    expect(asked).toEqual([])
  })

  it('lists the stored indices rather than picking one', async () => {
    // BU-95. It briefly opened on `catalogue[0]`, which is the same mistake
    // Universe Set made — landing inside a document nobody chose.
    mountFromSidebar()

    expect(await screen.findByText(SAVED.name)).toBeInTheDocument()
    expect(screen.getByText('TECH10')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('offers a way to create one, which is what the tab is for', async () => {
    // The create route used to be reachable only through a misread 404, and
    // BU-87 removed the misread along with the route.
    mountFromSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'New index…' }))

    await userEvent.type(screen.getByLabelText('Index id'), 'MY-NEW-IDX')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    // The editor, on a blank draft: the engine 404s an id it does not hold,
    // and `useIndexDraft` reads that as "a new index".
    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'MY-NEW-IDX' })).toBeInTheDocument()
  })

  it('goes back to the list from an index it opened', async () => {
    // Through the picker, since #103 removed the back arrow. Without one the
    // editor would be a one-way door: its header has no other route out.
    mountFromSidebar()
    await userEvent.click(await screen.findByText(SAVED.name))
    await screen.findByLabelText('Name')

    await userEvent.selectOptions(screen.getByLabelText('Index'), '')

    expect(await screen.findByRole('button', { name: 'New index…' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('refuses an id the engine could not address, before sending anything', async () => {
    mountFromSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'New index…' }))
    await userEvent.type(screen.getByLabelText('Index id'), 'my index')

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(screen.getByText(/Letters, digits, dash and underscore only/)).toBeInTheDocument()
  })

  it('refuses an id that is already taken', async () => {
    mountFromSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'New index…' }))
    await userEvent.type(screen.getByLabelText('Index id'), 'TECH10')

    expect(screen.getByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })
})
