import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useJobs } from '../../api/jobs'
import { ClientContext } from '../../api/queryClient'
import { useModellingDefaults } from '../../state/modellingDefaults'
import { useWorkspace } from '../../state/tabs.store'
import type { Tab } from '../../state/tabs.types'
import { ConstituentPreviewView } from '../constituent-preview/ConstituentPreviewView'
import { IndexDefinitionView } from '../index-definition/IndexDefinitionView'
import type { IndexDocument } from '../index-definition/pipeline'
import { BacktestView } from './BacktestView'
import { choose } from '../../../../test/select'

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
  // Required since BN-180; a document without one is a 422.
  calendar: 'XNYS',
  effective_lag_sessions: 0,
  withholding_tax_rate: 0,
  universe: { universe_id: 'US-LARGECAP' },
  pipeline: {
    selection: [{ id: 'r1', type: 'FilterRule', params: { sector: 'Information Technology' } }],
    weighting: { id: 'weighting', scheme: 'EqualWeighted' },
    treatment: { corporate_actions: 'ADJUST_DIVISOR' }
  }
}

/** The stored strategy the Backtest tab runs: NEWIDX, as defined. */
const STRATEGY = {
  id: 'newidx-plain',
  name: 'NEWIDX as defined',
  description: null,
  index_id: 'NEWIDX',
  strategy: { type: 'index', rebalancing: 'MONTHLY', constraints: [] },
  implementation: null,
  problem: null
}

const FEE: Record<string, unknown> = {
  name: 'management_fee_bps',
  type: 'number',
  required: false,
  default: 0,
  label: 'Management fee',
  order: 0,
  choices: null,
  help: null,
  unit: 'bps',
  applies_to: null
}

/** Just enough of `/backtest/options` for the form: one preset, one setting. */
const OPTIONS = {
  presets: [
    {
      key: 'uk_oeic',
      name: 'UK OEIC',
      archetype: 'open_ended',
      settings: { name: 'UK OEIC', management_fee_bps: 0, pricing: { type: 'SwingPricing' } }
    }
  ],
  vehicle_settings: [FEE],
  share_class_settings: [],
  flows: [],
  modelling_assumptions: [
    {
      name: 'cash_rate',
      label: 'Cash rate',
      type: 'number',
      required: false,
      default: 0,
      choices: null,
      help: '',
      unit: null,
      order: 0
    }
  ],
  screens: [],
  caps: [],
  choices: { dividends: ['reinvest', 'cash', 'distribute'] }
}

interface Calls {
  saved: IndexDocument[]
  previewed: { id: string; asOf?: string }[]
  backtested: { id: string; body: unknown }[]
  overviews: string[]
}

let calls: Calls
let queries: QueryClient
/** The index document the client serves; a test can make it another currency. */
let served: IndexDocument
/** What `/strategies/runs` lists. */
let runs: unknown[]

function makeClient(): BeaconClient {
  return {
    indices: {
      get: () => Promise.resolve(served),
      save: (_id: string, document: IndexDocument) => {
        calls.saved.push(document)
        return Promise.resolve({ index: document, findings: [] })
      },
      validate: () => Promise.resolve({ valid: true, findings: [] }),
      // The dates the As-of control offers (BU-202). Quarterly third
      // Fridays, as every fixture document here declares.
      schedule: () =>
        Promise.resolve({
          index_id: 'NEWIDX',
          as_of: '2026-08-04',
          calendar: 'XNYS',
          rebalancing_frequency: 'QUARTERLY',
          rebalance_day_rule: 'THIRD_FRIDAY',
          next_rebalance: '2026-09-18',
          days_until: 45,
          recent: ['2026-01-16', '2026-04-17', '2026-07-17'],
          recent_total: 3,
          upcoming: ['2026-09-18'],
          upcoming_total: 1
        }),
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
      const id = options.params.strategy_id ?? options.params.index_id ?? ''

      if (path.endsWith('/backtest/validate')) {
        return Promise.resolve({ valid: true, settings: {}, findings: [] })
      }

      calls.backtested.push({ id, body: options.body })
      return Promise.resolve({
        job_id: 'job-1',
        kind: `backtest:${id}`,
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

      // An envelope since BN-174, not the bare array: the rows could not
      // carry the skip count.
      if (path === '/strategies/runs') return Promise.resolve({ backtests: runs, skipped: 0 })
      if (path === '/strategies') return Promise.resolve({ strategies: [STRATEGY], skipped: 0 })
      if (path === '/backtest/options') return Promise.resolve(OPTIONS)
      // Nobody has run this strategy, so the form opens on the defaults.
      if (path === '/strategies/{strategy_id}/result') {
        return Promise.reject(new ApiError(404, { code: 'DATA_NOT_FOUND', message: 'no run' }))
      }
      if (path === '/strategies/{strategy_id}') {
        return options.params?.strategy_id === STRATEGY.id
          ? Promise.resolve(STRATEGY)
          : Promise.reject(
              new ApiError(404, { code: 'DATA_NOT_FOUND', message: 'no such strategy' })
            )
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
  useModellingDefaults.setState({ assumptions: {} })
  calls = { saved: [], previewed: [], backtested: [], overviews: [] }
  served = FRESH
  runs = []
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
    archetype: 'query',
    title: 'Backtest',
    subject: STRATEGY.id
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

  it('previews nothing until a date is chosen and Run is pressed', async () => {
    /*
     * It used to resolve on mount, and again on every keystroke in the
     * date field (BU-186). A preview is a job against a date somebody
     * chose, so the pane waits to be asked.
     */
    mount(<ConstituentPreviewView tab={tabFor('prev')} subject="NEWIDX" />)

    expect(
      await screen.findByText(/Choose a rebalance date to resolve this index at/)
    ).toBeInTheDocument()
    expect(calls.previewed).toEqual([])
    expect(screen.getByRole('button', { name: 'Run preview' })).toBeDisabled()
  })

  it('previews: the waterfall shows where each name dropped out', async () => {
    mount(<ConstituentPreviewView tab={tabFor('prev')} subject="NEWIDX" />)

    await screen.findByRole('combobox', { name: 'As of' })
    await choose('As of', '2026-07-17')
    await userEvent.click(screen.getByRole('button', { name: 'Run preview' }))

    expect(await screen.findByText('01 · FilterRule')).toBeInTheDocument()
    expect(calls.previewed).toEqual([{ id: 'NEWIDX', asOf: '2026-07-17' }])

    // AAPL survived, GOOGL was cut by rule 01.
    const rows = [...document.querySelectorAll('.tbl-row')]
    expect(rows[0]?.textContent).toContain('✓')
    expect(rows[1]?.textContent).toContain('✕')
  })

  it('previews at the chosen date, and only when asked', async () => {
    /*
     * Compare-vs went in BU-201. It resolved the index a second time to
     * compute turnover between two dates, which is a question about a
     * schedule rather than about a methodology — and this pane answers the
     * second one. The Weights pane holds the first.
     */
    mount(<ConstituentPreviewView tab={tabFor('prev')} subject="NEWIDX" />)
    await screen.findByRole('combobox', { name: 'As of' })
    await choose('As of', '2026-07-17')
    await userEvent.click(screen.getByRole('button', { name: 'Run preview' }))
    await screen.findByText('01 · FilterRule')

    expect(screen.queryByLabelText('Compare vs')).not.toBeInTheDocument()
    // One resolve, for the date that was asked for.
    expect(calls.previewed.map((call) => call.asOf)).toEqual(['2026-07-17'])
  })

  it('back-tests: submits a job, follows the feed, and leaves the result to the Overview', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    // The stored strategy is what runs (0.9.0): its id is the URL's.
    expect(calls.backtested[0]?.id).toBe(STRATEGY.id)

    // The socket, not a poll, is what reports progress (BU-21). The kind
    // names the strategy, so another strategy's run would not show here.
    act(() => {
      useJobs.getState().apply({
        type: 'job',
        job_id: 'job-1',
        kind: `backtest:${STRATEGY.id}`,
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
        kind: `backtest:${STRATEGY.id}`,
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

  it('lists the runs when no strategy is named, and a row opens its setup', async () => {
    runs = [
      {
        strategy_id: STRATEGY.id,
        strategy_name: STRATEGY.name,
        index_id: 'NEWIDX',
        run_at: null,
        strategy: 'index',
        vehicle: null,
        vehicle_preset: null,
        currency: 'USD'
      }
    ]
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    expect(await screen.findByText('Runs · 1')).toBeInTheDocument()
    await userEvent.click(screen.getByText(STRATEGY.name))

    expect(tabFor('bt').subject).toBe(STRATEGY.id)
  })

  it('says so when nothing has been run yet', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={undefined} />)

    expect(await screen.findByText(/No backtests have been run yet/)).toBeInTheDocument()
  })

  it('sends every setting the form collects, not just the ones it used to', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)
    await screen.findByLabelText('Transaction cost (bps)')

    await userEvent.clear(screen.getByLabelText('Transaction cost (bps)'))
    await userEvent.type(screen.getByLabelText('Transaction cost (bps)'), '25')
    // Capital is set in its pop-up (Karan, 2026-10-17).
    await userEvent.click(screen.getByRole('button', { name: 'Capital and flows…' }))
    await userEvent.clear(screen.getByLabelText('Initial capital'))
    await userEvent.type(screen.getByLabelText('Initial capital'), '250000')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.type(screen.getByLabelText('Start'), '2021-01-04')
    await userEvent.type(screen.getByLabelText('End'), '2024-12-31')

    await userEvent.click(screen.getByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.body).toMatchObject({
      transaction_cost_bps: 25,
      initial_capital: 250_000,
      start: '2021-01-04',
      end: '2024-12-31',
      dividends: 'reinvest'
    })
    // The strategy is the stored one's, and a body carrying it is refused;
    // no preset chosen is a plain run, with no vehicle at all.
    expect(calls.backtested[0]?.body).not.toHaveProperty('strategy')
    expect(calls.backtested[0]?.body).not.toHaveProperty('vehicle')
  })

  it('starts a new backtest from the app’s own modelling assumptions (BU-272)', async () => {
    useModellingDefaults.setState({ assumptions: { cash_rate: '0.03' } })
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.body).toMatchObject({ modelling_assumptions: { cash_rate: 0.03 } })
  })

  it('leaves a blank date out of the body rather than inventing one', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    // py-beacon starts at the index base date and ends at its last
    // observation, which beats any default this form could choose.
    expect(calls.backtested[0]?.body).not.toHaveProperty('start')
    expect(calls.backtested[0]?.body).not.toHaveProperty('end')
  })

  it('runs as a preset vehicle, sending only what was changed on it', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)
    await screen.findByLabelText('Transaction cost (bps)')

    await choose('Preset', 'uk_oeic')
    // The preset's own fee shows, and is not sent until it is changed.
    expect(screen.getByLabelText('Management fee')).toHaveValue('0')
    await userEvent.clear(screen.getByLabelText('Management fee'))
    await userEvent.type(screen.getByLabelText('Management fee'), '35')

    await userEvent.click(screen.getByRole('button', { name: 'Run backtest' }))

    await waitFor(() => {
      expect(calls.backtested).toHaveLength(1)
    })
    expect(calls.backtested[0]?.body).toMatchObject({
      vehicle: { preset: 'uk_oeic', settings: { management_fee_bps: 35 } }
    })
  })

  it('will not submit a body the engine would refuse', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject={STRATEGY.id} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Capital and flows…' }))
    await userEvent.clear(screen.getByLabelText('Initial capital'))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    // Said here rather than fetched as a 422: the form knows this one.
    expect(screen.getByText(/The initial capital must be more than zero/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run backtest' })).toBeDisabled()
  })

  it('says when no stored strategy has the name typed', async () => {
    mount(<BacktestView tab={tabFor('bt')} subject="NOT-A-STRATEGY" />)

    expect(await screen.findByText(/no saved strategy called NOT-A-STRATEGY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run backtest' })).toBeNull()
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
