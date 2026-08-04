import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useJobs } from '../../api/jobs'
import { ClientContext } from '../../api/queryClient'
import { useWorkspace } from '../../state/tabs.store'
import type { Tab } from '../../state/tabs.types'
import { ConstituentPreviewView } from '../constituent-preview/ConstituentPreviewView'
import { IndexDefinitionView } from '../index-definition/IndexDefinitionView'
import type { IndexDocument } from '../index-definition/pipeline'
import { BacktestView } from './BacktestView'

/**
 * BU-27 acceptance: define → preview → backtest, end to end.
 *
 * The chart itself is never mounted here — lightweight-charts needs a real 2D
 * canvas context, which jsdom does not provide (ADR-0002). The overview
 * therefore returns an empty level series, and what this file proves is the
 * FLOW: that each stage calls the right endpoint with the right argument, and
 * that the job feed is what advances it.
 */

const FRESH: IndexDocument = {
  id: 'NEWIDX',
  name: 'A brand new index',
  currency: 'USD',
  base_date: '2020-01-01',
  base_value: 100,
  rebalancing_frequency: 'QUARTERLY',
  return_type: 'PRICE',
  rebalance_day_rule: 'FIRST_BUSINESS_DAY',
  effective_lag_sessions: 0,
  withholding_tax_rate: 0,
  universe: { universe_id: 'US-LARGECAP' },
  pipeline: {
    selection: [{ id: 'r1', type: 'FilterRule', params: { sector: 'Information Technology' } }],
    weighting: { id: 'weighting', scheme: 'EqualWeighted' },
    treatment: { corporate_actions: 'ADJUST_DIVISOR' }
  }
}

interface Calls {
  saved: IndexDocument[]
  previewed: { id: string; asOf?: string }[]
  backtested: { id: string; body: unknown }[]
  overviews: string[]
}

let calls: Calls
let queries: QueryClient

function makeClient(): BeaconClient {
  return {
    indices: {
      get: () => Promise.resolve(FRESH),
      save: (_id: string, document: IndexDocument) => {
        calls.saved.push(document)
        return Promise.resolve({ index: document, findings: [] })
      },
      validate: () => Promise.resolve({ valid: true, findings: [] }),
      preview: (id: string, body: { as_of?: string }) => {
        calls.previewed.push(body.as_of === undefined ? { id } : { id, asOf: body.as_of })
        return Promise.resolve({
          index_id: id,
          as_of: body.as_of ?? '2026-07-22',
          assets: [
            { identifier: 'AAPL', included: true, capped: false, weight: 0.5 },
            {
              identifier: 'GOOGL',
              included: false,
              capped: false,
              excluded_at: 1,
              excluded_by: 'r1'
            }
          ],
          steps: [
            { position: 0, remaining: 512 },
            { position: 1, rule_id: 'r1', rule_type: 'FilterRule', remaining: 1 }
          ],
          weights: { AAPL: 0.5 },
          total_weight: 1,
          cap: null,
          cap_redistributed: 0
        })
      },
      list: () => Promise.resolve({ indices: [FRESH] })
    },
    universes: {
      list: () => Promise.resolve({ universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] }),
      members: () => Promise.resolve({ universe_id: 'US-LARGECAP', identifiers: ['AAPL'] })
    },
    write: (
      _method: string,
      _path: string,
      options: { params: Record<string, string>; body: unknown }
    ) => {
      calls.backtested.push({ id: options.params.index_id ?? '', body: options.body })
      return Promise.resolve({
        job_id: 'job-1',
        kind: 'backtest',
        status: 'pending',
        progress: 0,
        message: ''
      })
    },
    get: (path: string, options: { params?: Record<string, string> }) => {
      calls.overviews.push(options.params?.index_id ?? path)
      return Promise.resolve({
        index_id: 'NEWIDX',
        name: 'A brand new index',
        start: '2020-01-01',
        end: '2026-07-22',
        observations: 1_600,
        rebalances: 26,
        last_rebalance: '2026-06-19',
        // Empty on purpose: see the note at the top of this file.
        level: { index: [], data: [] },
        metrics: {
          annualised_return: 0.207,
          volatility: 0.225,
          sharpe_ratio: 0.72,
          max_drawdown: -0.334,
          total_return: 2.41
        },
        concentration: {
          constituents: 1,
          effective_assets: 1,
          herfindahl: 1,
          largest: 1,
          top_weights: {}
        }
      })
    },
    data: { reference: () => Promise.resolve({ identifier: 'x', fields: {} }) }
  } as unknown as BeaconClient
}

function mount(view: ReactElement): void {
  render(
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={makeClient()}>{view}</ClientContext.Provider>
    </QueryClientProvider>
  )
}

function tabFor(id: string): Tab {
  const tab = useWorkspace.getState().tabs.find((candidate) => candidate.id === id)
  if (tab === undefined) throw new Error(`no tab ${id}`)
  return tab
}

beforeEach(() => {
  calls = { saved: [], previewed: [], backtested: [], overviews: [] }
  queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } }
  })
  localStorage.clear()
  useJobs.getState().reset()
  const store = useWorkspace.getState()
  store.reset()
  store.openTab({
    id: 'def',
    page: 'strategy-builder',
    viewKind: 'index-definition',
    archetype: 'document',
    title: 'NEWIDX'
  })
  store.openTab({
    id: 'prev',
    page: 'strategy-builder',
    viewKind: 'constituent-preview',
    archetype: 'query',
    title: 'Constituent Preview',
    subject: 'NEWIDX'
  })
  store.openTab({
    id: 'bt',
    page: 'beacon-view',
    viewKind: 'backtest',
    archetype: 'pinned',
    title: 'Backtest',
    pinnedDoc: 'NEWIDX'
  })
})

describe('define → preview → backtest (BU-27 acceptance)', () => {
  it('defines: an edit is saved to the engine and clears the tab’s dirty flag', async () => {
    mount(<IndexDefinitionView tab={tabFor('def')} subject={undefined} />)

    await userEvent.click(await screen.findByRole('button', { name: /Add rule/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(calls.saved).toHaveLength(1)
    })
    expect(calls.saved[0]?.pipeline.selection).toHaveLength(2)
    await waitFor(() => {
      expect(tabFor('def').dirty).toBe(false)
    })
  })

  it('previews: the waterfall shows where each name dropped out', async () => {
    mount(<ConstituentPreviewView tab={tabFor('prev')} subject="NEWIDX" />)

    expect(await screen.findByText('01 · FilterRule')).toBeInTheDocument()
    expect(calls.previewed).toEqual([{ id: 'NEWIDX' }])

    // AAPL survived, GOOGL was cut by rule 01.
    const rows = [...document.querySelectorAll('.tbl-row')]
    expect(rows[0]?.textContent).toContain('✓')
    expect(rows[1]?.textContent).toContain('✕')
  })

  it('previews at a chosen date, which is what makes turnover computable', async () => {
    mount(<ConstituentPreviewView tab={tabFor('prev')} subject="NEWIDX" />)
    await screen.findByText('01 · FilterRule')

    await userEvent.type(screen.getByLabelText('Compare vs'), '2026-06-19')

    await waitFor(() => {
      expect(calls.previewed.some((call) => call.asOf === '2026-06-19')).toBe(true)
    })
  })

  it('back-tests: submits a job, follows the feed, then reads the result back', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.id).toBe('NEWIDX')

    // The socket, not a poll, is what reports progress (BU-21).
    act(() => {
      useJobs.getState().apply({
        type: 'job',
        job_id: 'job-1',
        kind: 'backtest',
        status: 'running',
        progress: 0.4,
        message: 'rebalancing 2023'
      })
    })
    expect(screen.getByText('rebalancing 2023')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Backtest progress' })).toHaveAttribute(
      'aria-valuenow',
      '40'
    )

    act(() => {
      useJobs.getState().apply({
        type: 'job',
        job_id: 'job-1',
        kind: 'backtest',
        status: 'succeeded',
        progress: 1,
        message: 'done'
      })
    })

    // JobStatus.result is typed unknown, so the result comes from the
    // endpoint that has a schema.
    await waitFor(() => {
      expect(calls.overviews).toContain('NEWIDX')
    })
  })

  it('does not show a stale overview as though it were this session’s run', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    expect(await screen.findByText(/No backtest run yet/)).toBeInTheDocument()
    expect(calls.overviews).toHaveLength(0)
  })

  it('sends the transaction cost the user chose', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)
    await screen.findByLabelText('Costs')

    await userEvent.selectOptions(screen.getByLabelText('Costs'), '25')
    await userEvent.click(screen.getByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.body).toMatchObject({ transaction_cost_bps: 25 })
  })
})

describe('a fresh index', () => {
  it('treats a 404 as an index to create, not as a failure', async () => {
    const missing = {
      ...makeClient(),
      indices: {
        ...makeClient().indices,
        get: () =>
          Promise.reject(
            new ApiError(404, { code: 'NOT_FOUND', message: "index 'NEWIDX' not found" })
          )
      }
    } as unknown as BeaconClient

    render(
      <QueryClientProvider client={queries}>
        <ClientContext.Provider value={missing}>
          <IndexDefinitionView tab={tabFor('def')} subject={undefined} />
        </ClientContext.Provider>
      </QueryClientProvider>
    )

    // The document tab becomes the editor for creating it.
    expect(await screen.findByLabelText('Name')).toHaveValue('NEWIDX')
    expect(screen.getByText(/new · not saved yet/)).toBeInTheDocument()
    // The id is editable, because it is not yet a URL anywhere.
    expect(screen.getByLabelText('Id')).not.toBeDisabled()
  })
})
