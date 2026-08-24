import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { resolveSubject } from '../../state/tabs.logic'
import { useWorkspace } from '../../state/tabs.store'
import { ChartingView } from './ChartingView'

/**
 * An engine that answers with no rows.
 *
 * Deliberate: lightweight-charts needs a real 2D canvas context, which jsdom
 * does not provide (ADR-0002), so a test that produced points would crash on
 * the renderer rather than on anything this file is about. The linked-tab
 * mechanics are what BU-25 has to prove, and they do not involve the canvas.
 */
const EMPTY = { interval: 'native', prices: { index: [], columns: ['close'], data: [] } }

function Harness(): ReactElement {
  const state = useWorkspace()
  const tab = state.tabs.find((candidate) => candidate.id === 'charting')
  if (tab === undefined) return <p>gone</p>
  return <ChartingView tab={tab} subject={resolveSubject(state, tab)} />
}

function mount(): void {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const client = {
    data: {
      prices: () => Promise.resolve(EMPTY),
      reference: () => Promise.resolve({ identifier: 'AAPL', fields: {} })
    }
  } as unknown as BeaconClient

  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>
        <Harness />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'prices',
    page: 'data-explorer',
    viewKind: 'prices',
    archetype: 'query',
    title: 'Prices',
    subject: 'AAPL'
  })
  store.openTab({
    id: 'charting',
    page: 'data-explorer',
    viewKind: 'charting',
    archetype: 'linked',
    title: 'Charting',
    linkSourceId: 'prices'
  })
})

describe('linked-tab mechanics (BU-25 acceptance)', () => {
  it('shows the source tab as the subject, not one of its own', () => {
    mount()

    expect(screen.getByLabelText('Subject')).toHaveValue('AAPL')
    // Once: the field's hint saying how to take ownership went with #103, so
    // the footnote is the only place that spells the link out.
    expect(screen.getAllByText(/linked to Prices/)).toHaveLength(1)
  })

  it('re-renders when the Prices tab changes subject', () => {
    mount()

    act(() => {
      useWorkspace.getState().setSubject('prices', 'MSFT')
    })

    // Nothing was pushed to this tab: it stores no subject and resolves one
    // from its source on every read.
    expect(screen.getByLabelText('Subject')).toHaveValue('MSFT')
  })

  it('severs when the user types into it', async () => {
    mount()

    await userEvent.type(screen.getByLabelText('Subject'), 'M')

    expect(useWorkspace.getState().tabs.find((tab) => tab.id === 'charting')?.archetype).toBe(
      'query'
    )
  })

  it('stops following once severed', async () => {
    mount()
    await userEvent.type(screen.getByLabelText('Subject'), 'M')

    act(() => {
      useWorkspace.getState().setSubject('prices', 'NVDA')
    })

    // The severed tab keeps the subject it inherited at the moment it broke.
    expect(useWorkspace.getState().tabs.find((tab) => tab.id === 'charting')?.subject).toBe('AAPL')
    expect(screen.getByText(/independent/)).toBeInTheDocument()
  })

  it('takes ownership on Enter, so a query is also a claim', async () => {
    mount()

    const field = screen.getByLabelText('Subject')
    await userEvent.clear(field)
    await userEvent.type(field, 'NVDA{Enter}')

    const charting = useWorkspace.getState().tabs.find((tab) => tab.id === 'charting')
    expect(charting?.archetype).toBe('query')
    expect(charting?.subject).toBe('NVDA')
    // The source is untouched — severing is not a two-way edit.
    expect(useWorkspace.getState().tabs.find((tab) => tab.id === 'prices')?.subject).toBe('AAPL')
  })
})

describe('compare chips', () => {
  it('adds an asset and lets it be removed again', async () => {
    mount()

    await userEvent.click(screen.getByRole('button', { name: /Add asset/ }))
    await userEvent.type(screen.getByLabelText('Add asset…'), 'msft{Enter}')

    expect(screen.getByText('MSFT')).toBeInTheDocument()
    expect(screen.getByText(/compare: MSFT \(rebased\)/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove MSFT' }))
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument()
  })

  it('refuses to compare an asset against itself', async () => {
    mount()

    await userEvent.click(screen.getByRole('button', { name: /Add asset/ }))
    await userEvent.type(screen.getByLabelText('Add asset…'), 'aapl{Enter}')

    expect(screen.queryByRole('button', { name: 'Remove AAPL' })).not.toBeInTheDocument()
  })
})

describe('range and interval', () => {
  it('reports the window in the footnote, so the axis is never ambiguous', async () => {
    mount()

    expect(screen.getByText(/1Y daily/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '3M' }))
    expect(screen.getByText(/3M daily/)).toBeInTheDocument()
  })

  it('labels py-beacon’s "native" interval as Daily, which is what it is here', async () => {
    mount()

    // The parameter means "the source's own frequency"; the loaded market
    // data is daily, so the label and the value deliberately differ.
    expect(screen.getByLabelText('Interval')).toHaveValue('native')

    await userEvent.selectOptions(screen.getByLabelText('Interval'), 'weekly')
    expect(screen.getByText(/3M weekly|1Y weekly/)).toBeInTheDocument()
  })
})
