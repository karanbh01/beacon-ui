import type { ReactElement } from 'react'
import { activeJobs, useJobs, type TrackedJob } from '../../api/jobs'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { FaultNotice, ViewEmpty, ViewError, ViewLoading, type Fault } from '../shared/ViewState'
import { isAbsent } from '../shared/beaconQueries'
import { describeSkipped } from '../shared/pickers'
import {
  useBacktestOptions,
  useRunStrategyBacktest,
  useStrategy,
  useStrategyCatalogue,
  useValidateStrategyBacktest,
  type StoredStrategy
} from '../shared/strategyDocuments'
import { useBacktestRun } from '../shared/strategyQueries'
import { MoneySection } from './MoneySection'
import { PeriodSection } from './PeriodSection'
import { RunsList } from './RunsList'
import { VehicleSection } from './VehicleSection'
import { setupFindings, toRequest } from './setup'
import { useBacktestSetup } from './useBacktestSetup'
import './BacktestView.css'
import { useTabState } from '../../state/tabMemory'

/**
 * Beacon View → Backtest (BU-174; a stored strategy's since py-beacon 0.9.0).
 *
 * The strategy is written in Strategy Builder; this is where it is RUN
 * (Karan): the vehicle it runs as, the money, the period and the costs. With
 * no strategy named it is the list of runs the engine kept, since "what has
 * been run" is the first question a reader of this tab has.
 *
 * What the run DID is read in the Overview (BU-175). A second chart of the
 * same series in a second tab is two places to keep in step, and only one of
 * them is where anyone looks for performance.
 */
export function BacktestView({ tab, subject, pane }: ViewProps): ReactElement {
  // `pinnedDoc` is still read: a tab saved in a preset while this view was
  // pinned keeps working (BU-164).
  const strategyId = subject ?? tab.pinnedDoc ?? ''
  const setSubject = useWorkspace((state) => state.setSubject)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const catalogue = useStrategyCatalogue()
  const strategy = useStrategy(strategyId)

  const open = (viewKind: string, page: string): void => {
    openOrRetarget({ page, pane, viewKind, title: strategyId, subject: strategyId })
  }

  return (
    <div className="backtest-view">
      <PaneHeader
        kind="query"
        subject={strategyId}
        index={catalogue.rows}
        {...metaOf(strategy.data, catalogue.skipped)}
        onQuery={(next) => {
          // As typed: a strategy's id is the user's, and case is part of it.
          setSubject(tab.id, next)
        }}
        controls={
          strategyId === '' ? undefined : (
            <>
              <Button
                onClick={() => {
                  setSubject(tab.id, '')
                }}
              >
                All runs
              </Button>
              <Button
                onClick={() => {
                  open('strategy', 'strategy-builder')
                }}
              >
                Open strategy
              </Button>
            </>
          )
        }
      />

      {strategyId === '' && (
        <RunsList
          onOpen={(id) => {
            setSubject(tab.id, id)
          }}
        />
      )}

      {strategyId !== '' && strategy.isPending && <ViewLoading what={strategyId} />}
      {strategy.isError &&
        (isAbsent(strategy.error) ? (
          <ViewEmpty figure="binders">
            There’s no saved strategy called {strategyId}. Create it in Strategy Builder first.
          </ViewEmpty>
        ) : (
          <ViewError error={strategy.error} />
        ))}

      {strategy.isSuccess && (
        <Setup
          // A fresh form per strategy: one's flows are not another's.
          key={strategyId}
          tabId={tab.id}
          strategy={strategy.data}
          onOpenOverview={() => {
            open('overview', 'beacon-view')
          }}
        />
      )}
    </div>
  )
}

function Setup({
  tabId,
  strategy,
  onOpenOverview
}: {
  tabId: string
  strategy: StoredStrategy
  onOpenOverview: () => void
}): ReactElement {
  // The run submitted from this tab, so its progress is still here on coming back.
  const [jobId, setJobId] = useTabState<string | undefined>(
    tabId,
    `backtest-job:${strategy.id}`,
    undefined
  )

  const options = useBacktestOptions()
  const {
    setup,
    edit: setSetup,
    origin,
    startAfresh
  } = useBacktestSetup(tabId, strategy.id, options.data)
  const validate = useValidateStrategyBacktest()
  const run = useRunStrategyBacktest()
  const jobs = useJobs((state) => state.jobs)

  // The job kind names the strategy since 0.9.0, so another strategy's run
  // in flight does not hold this form.
  const running = activeJobs(jobs).find((job) => job.kind === `backtest:${strategy.id}`)
  const status = useBacktestRun(jobId, jobId !== undefined && running === undefined)
  const failure = failureOf(jobId === undefined ? undefined : jobs[jobId], status.data)
  const finished =
    jobId !== undefined &&
    failure === undefined &&
    running === undefined &&
    status.data !== undefined

  const findings = setupFindings(setup, strategy.id)
  const busy = run.isPending || running !== undefined
  const body = (): ReturnType<typeof toRequest> => toRequest(setup, options.data)

  const submit = (): void => {
    validate.reset()
    run.mutate(
      { strategyId: strategy.id, body: body() },
      {
        onSuccess: (job) => {
          setJobId(job.job_id)
        }
      }
    )
  }

  return (
    <>
      <StrategyLine strategy={strategy} />
      {origin === 'run' && (
        <div className="backtest-origin">
          <p className="backtest-note type-11">
            These settings come from the last backtest of {strategy.id}. Change anything you want
            before running it again.
          </p>
          <Button onClick={startAfresh}>Start afresh</Button>
        </div>
      )}

      <VehicleSection setup={setup} onChange={setSetup} options={options.data} />
      <MoneySection setup={setup} onChange={setSetup} options={options.data} />
      <PeriodSection setup={setup} onChange={setSetup} options={options.data} />

      {findings.length > 0 && (
        <ul className="backtest-findings type-11">
          {findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      )}

      <div className="backtest-actions">
        <Button
          disabled={findings.length > 0 || validate.isPending}
          onClick={() => {
            validate.mutate({ strategyId: strategy.id, body: body() })
          }}
        >
          {validate.isPending ? 'Checking…' : 'Validate'}
        </Button>
        <Button variant="accent" disabled={busy || findings.length > 0} onClick={submit}>
          {busy ? 'Running…' : 'Run backtest'}
        </Button>
      </div>

      {validate.isError && <ViewError error={validate.error} />}
      {validate.data !== undefined && <Validation result={validate.data} />}
      {run.isError && <ViewError error={run.error} />}
      {running !== undefined && <Progress job={running} />}

      {/*
        Headed by what KIND of failure it was, not by the pane it happened
        in (BU-207): `FaultNotice` reads the code, and the engine's own words
        follow either way.
      */}
      {failure !== undefined && <FaultNotice fault={failure} />}

      {finished && (
        <div className="backtest-done">
          <p className="type-13">The backtest for {strategy.id} has finished.</p>
          <div className="backtest-done-actions">
            <Button variant="accent" onClick={onOpenOverview}>
              Open overview
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

/** What is being run: the strategy as stored, which this form cannot change. */
function StrategyLine({ strategy }: { strategy: StoredStrategy }): ReactElement {
  const implementation = strategy.implementation
  const stages = [
    ...(implementation?.screens ?? []).map((spec) => spec.type),
    ...(implementation?.caps ?? []).map((spec) => spec.type)
  ]
  return (
    <SummaryLine
      className="backtest-strategy"
      items={[
        { label: 'strategy', value: strategy.name },
        { label: 'index', value: strategy.index_id },
        { label: 'kind', value: strategy.strategy?.type ?? 'index' },
        { label: 'implementation', value: stages.length === 0 ? 'none' : stages.join(', ') }
      ]}
    />
  )
}

/** The engine's reading of the request: what would run, or what stops it. */
function Validation({
  result
}: {
  result: { valid: boolean; findings?: readonly { path: string; message: string }[] }
}): ReactElement {
  if (result.valid) {
    return <p className="backtest-note type-11">No problems found. The backtest is ready to run.</p>
  }
  return (
    <FaultNotice
      fault={{
        code: 'INVALID_RULE',
        message: 'This backtest can’t run with these settings.',
        detail: { findings: result.findings ?? [] }
      }}
    />
  )
}

function Progress({ job }: { job: TrackedJob }): ReactElement {
  return (
    <div className="backtest-progress">
      <div
        className="backtest-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress * 100)}
        aria-label="Backtest progress"
      >
        <div className="backtest-fill" style={{ width: `${String(job.progress * 100)}%` }} />
      </div>
      <p className="type-11">{job.message === '' ? 'Running…' : job.message}</p>
    </div>
  )
}

/**
 * Why this run did not happen (BU-162), as the envelope (BN-199).
 *
 * Read from the job endpoint as well as the event feed, which is a socket a
 * dropped frame can leave silent.
 */
function failureOf(
  submitted: TrackedJob | undefined,
  status: { status: string; error?: Fault } | undefined
): Fault | undefined {
  if (submitted?.status === 'failed') {
    return submitted.error ?? { code: 'UNCLASSIFIED_FAILURE', message: submitted.message }
  }
  if (status?.status === 'failed') {
    return status.error ?? { code: 'UNCLASSIFIED_FAILURE', message: 'The engine gave no reason.' }
  }
  return undefined
}

/** The header's line: the strategy's name and index, and what the catalogue skipped. */
function metaOf(
  strategy: StoredStrategy | undefined,
  skipped: Parameters<typeof describeSkipped>[0]
): { meta?: string } {
  const parts = [
    strategy === undefined ? undefined : `${strategy.name} · ${strategy.index_id}`,
    describeSkipped(skipped)
  ].filter((part) => part !== undefined)
  return parts.length === 0 ? {} : { meta: parts.join(' · ') }
}
