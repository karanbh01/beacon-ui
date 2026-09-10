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
  optimised: { id: string; body: unknown }[]
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
      path: string,
      options: { params: Record<string, string>; body: unknown }
    ) => {
      const id = options.params.index_id ?? ''

      /*
       * Optimising is a different call from running (BU-174), and the pane
       * makes both in sequence when the box is ticked. Recorded apart, or a
       * test could not tell "back-tested the child" from "back-tested twice".
       */
      if (path.includes('optimise')) {
        calls.optimised.push({ id, body: options.body })
        const body = options.body as { id: string; name: string }
        return Promise.resolve({
          index: { ...FRESH, id: body.id, name: body.name },
          findings: []
        })
      }

      calls.backtested.push({ id, body: options.body })
      return Promise.resolve({
        job_id: 'job-1',
        kind: 'backtest',
        status: 'pending',
        progress: 0,
        message: ''
      })
    },
    /*
     * The job endpoint, which is how the pane learns a run finished: the
     * event feed is a socket, and a dropped frame would otherwise leave a
     * finished run looking like one still going (BU-162).
     */
    jobs: {
      get: (jobId: string) =>
        Promise.resolve({
          job_id: jobId,
          kind: 'backtest',
          status: 'succeeded',
          progress: 1,
          message: 'done',
          result: null,
          error: null
        })
    },
    get: (path: string, options: { params?: Record<string, string> }) => {
      /*
       * By path, not by every GET (BU-169).
       *
       * The pane asks for a stored record as well now, and counting that as
       * an overview would make "the overview was not asked for" true of a
       * request nobody made. The record answers 404, which is the ordinary
       * reply for an index nobody has back-tested.
       */
      if (path.includes('record')) {
        return Promise.reject(
          new ApiError(404, { code: 'DATA_NOT_FOUND', message: 'no record for this index' })
        )
      }

      // Nobody has back-tested anything here, which is what the header says.
      if (path === '/beacon/backtests') return Promise.resolve([])

      if (path === '/optimise/constraint-types') {
        return Promise.resolve({
          types: { MaxWeight: { name: 'MaxWeight', label: 'Maximum weight', parameters: [] } }
        })
      }

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
  calls = { saved: [], previewed: [], backtested: [], optimised: [], overviews: [] }
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

    // Three slots since the frame's shape was matched — Selection's is first.
    await userEvent.click((await screen.findAllByRole('button', { name: /^\+ Add rule/ }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(calls.saved).toHaveLength(1)
    })
    expect(calls.saved[0]?.pipeline?.selection).toHaveLength(2)
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

  it('back-tests: submits a job, follows the feed, and leaves the result to the Overview', async () => {
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

    /*
     * The pane hands the run over rather than drawing it (BU-174).
     *
     * Performance is read in the Overview, and a second chart of the same
     * series here would be two places to keep in step. So the finished state
     * is a route to the answer, and this pane never asks for one.
     */
    expect(await screen.findByRole('button', { name: 'Open overview' })).toBeInTheDocument()
    expect(calls.overviews).toHaveLength(0)
  })

  it('says when the index was last run, which is what to know before running it', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    // True of the INDEX, not of the session (BU-169): nobody has run this,
    // and the catalogue of records is what says so.
    expect(await screen.findByText(/never back-tested/)).toBeInTheDocument()
    expect(calls.overviews).toHaveLength(0)
  })

  it('sends every setting the form collects, not just the ones it used to', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)
    await screen.findByLabelText('Transaction cost (bps)')

    await userEvent.clear(screen.getByLabelText('Transaction cost (bps)'))
    await userEvent.type(screen.getByLabelText('Transaction cost (bps)'), '25')
    await userEvent.clear(screen.getByLabelText('Initial capital'))
    await userEvent.type(screen.getByLabelText('Initial capital'), '250000')
    await userEvent.type(screen.getByLabelText('Start'), '2021-01-04')
    await userEvent.type(screen.getByLabelText('End'), '2024-12-31')

    await userEvent.click(screen.getByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    // Capital was hard-coded at 1,000,000 in the mutation before this, and
    // the period was whatever py-beacon defaulted to.
    expect(calls.backtested[0]?.body).toMatchObject({
      transaction_cost_bps: 25,
      initial_capital: 250_000,
      start: '2021-01-04',
      end: '2024-12-31'
    })
  })

  it('leaves a blank date out of the body rather than inventing one', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    // py-beacon starts at the index base date and ends at its last
    // observation, which beats any default this form could choose.
    expect(calls.backtested[0]?.body).not.toHaveProperty('start')
    expect(calls.backtested[0]?.body).not.toHaveProperty('end')
  })

  it('will not submit a body the engine would refuse', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)
    await screen.findByLabelText('Initial capital')

    await userEvent.clear(screen.getByLabelText('Initial capital'))

    // Said here rather than fetched as a 422: the form knows this one.
    expect(screen.getByText(/Initial capital has to be more than zero/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run backtest' })).toBeDisabled()
  })

  it('optimises first when asked, and back-tests the index that came out', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Optimise first' }))

    // The child's identity is suggested, not imposed — both boxes are live.
    expect(screen.getByLabelText('Optimised index id')).toHaveValue('NEWIDX-OPT')
    await userEvent.clear(screen.getByLabelText('Optimised index id'))
    await userEvent.type(screen.getByLabelText('Optimised index id'), 'NEWIDX-MINTE')

    await userEvent.click(screen.getByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.optimised).toHaveLength(1)
    })
    // The parent is the URL's, because provenance is the engine's to assert.
    expect(calls.optimised[0]?.id).toBe('NEWIDX')
    expect(calls.optimised[0]?.body).toMatchObject({
      id: 'NEWIDX-MINTE',
      objective: 'min_tracking_error'
    })

    // And the run goes against the CHILD: the parent's numbers would answer
    // a question nobody asked.
    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.id).toBe('NEWIDX-MINTE')
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
