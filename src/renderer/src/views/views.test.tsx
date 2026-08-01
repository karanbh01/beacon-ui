import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../api/client'
import { ApiError, NetworkError } from '../api/errors'
import { ClientContext } from '../api/queryClient'
import type { Tab } from '../state/tabs.types'
import { CorporateActionsView } from './corporate-actions/CorporateActionsView'
import { ReferenceView } from './reference/ReferenceView'

function tab(viewKind: string): Tab {
  return { id: 't', page: 'data-explorer', viewKind, archetype: 'query', title: 'T', dirty: false }
}

/**
 * A client whose two data calls are supplied per test.
 *
 * Retries are off so a rejection surfaces on the first render pass rather
 * than after the query client's backoff, which would make every error test
 * wait on real timers.
 */
function mount(
  view: ReactElement,
  responses: { reference?: unknown; corporateActions?: unknown }
): HTMLElement {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })

  const resolve = (value: unknown): Promise<never> =>
    value instanceof Error ? Promise.reject(value) : (Promise.resolve(value) as Promise<never>)

  const client = {
    data: {
      reference: () => resolve(responses.reference),
      corporateActions: () => resolve(responses.corporateActions)
    }
  } as unknown as BeaconClient

  return render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>{view}</ClientContext.Provider>
    </QueryClientProvider>
  ).container
}

describe('ReferenceView', () => {
  const FIELDS = {
    identifier: 'AAPL',
    fields: { name: 'Apple Inc.', currency: 'USD', sector: 'Technology', mystery_column: 'x' }
  }

  it('renders the four Figma cards once the engine answers', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    expect(await screen.findByText('Identifiers')).toBeInTheDocument()
    expect(screen.getByText('Classification')).toBeInTheDocument()
    expect(screen.getByText('Corporate profile')).toBeInTheDocument()
    expect(screen.getByText('Universe membership')).toBeInTheDocument()
  })

  it('shows a dash for a field this engine does not carry', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    // The row must stay: a shorter card would read as "no ISIN exists" rather
    // than "this reference source does not publish one".
    const isin = (await screen.findByText('ISIN')).closest('.kv')
    expect(isin?.querySelector('.kv-value')?.textContent).toBe('—')
  })

  it('admits the fields its cards do not show', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, { reference: FIELDS })

    expect(await screen.findByText(/1 not shown on these cards/)).toBeInTheDocument()
  })

  it('asks for an identifier instead of querying for an empty one', () => {
    mount(<ReferenceView tab={tab('reference-data')} subject={undefined} />, {})

    expect(screen.getByText(/Type an identifier/)).toBeInTheDocument()
  })

  it('names the engine, not the request, when the engine is unreachable', async () => {
    mount(<ReferenceView tab={tab('reference-data')} subject="AAPL" />, {
      reference: new NetworkError('down')
    })

    expect(await screen.findByText(/engine is not reachable/)).toBeInTheDocument()
  })
})

describe('CorporateActionsView', () => {
  const ACTIONS = {
    identifier: 'AAPL',
    actions: [
      { ex_date: '2026-05-09', type: 'DIVIDEND', value: 0.26 },
      { ex_date: '2026-02-07', type: 'DIVIDEND', value: 0.25 },
      { ex_date: '2020-08-31', type: 'SPLIT', value: 4 }
    ],
    cumulative_split_ratio: 4,
    trailing_dividend: 1.03,
    trailing_dividend_yield: 0.0049
  }

  it('summarises what py-beacon computed rather than recomputing it', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: ACTIONS
    })

    expect(await screen.findByText('1.03 / share')).toBeInTheDocument()
    expect(screen.getByText('0.49%')).toBeInTheDocument()
    expect(screen.getByText('×4.00')).toBeInTheDocument()
  })

  it('lists actions newest first', async () => {
    const container = mount(
      <CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />,
      {
        corporateActions: ACTIONS
      }
    )

    await screen.findByText('09 May 2026')
    const dates = [...container.querySelectorAll('.tbl-row')].map(
      (row) => row.firstElementChild?.textContent
    )
    expect(dates).toEqual(['09 May 2026', '07 Feb 2026', '31 Aug 2020'])
  })

  it('filters client-side, leaving the server-computed totals standing', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: ACTIONS
    })

    await userEvent.click(await screen.findByRole('radio', { name: 'Split' }))

    expect(screen.getByText('31 Aug 2020')).toBeInTheDocument()
    expect(screen.queryByText('09 May 2026')).not.toBeInTheDocument()
    // The dividend total is over everything the engine sent, so filtering the
    // table must not appear to change it.
    expect(screen.getByText('1.03 / share')).toBeInTheDocument()
    expect(screen.getByText(/1 action of 3/)).toBeInTheDocument()
  })

  it('says nothing rather than guessing when no future action was sent', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: { ...ACTIONS, actions: [] }
    })

    expect(await screen.findByText(/No corporate actions/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explains a missing data source instead of showing a raw failure', async () => {
    mount(<CorporateActionsView tab={tab('corporate-actions')} subject="AAPL" />, {
      corporateActions: new ApiError(500, {
        code: 'CONFIGURATION_ERROR',
        message: 'no data source configured'
      })
    })

    expect(await screen.findByText(/no data source/)).toBeInTheDocument()
  })
})
