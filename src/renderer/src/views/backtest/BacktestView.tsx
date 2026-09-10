import { useState, type ReactElement } from 'react'
import { activeJobs, useJobs } from '../../api/jobs'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Checkbox } from '../../components/Checkbox/Checkbox'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewError } from '../shared/ViewState'
import { relativeTime } from '../home/activityRows'
import { useBacktestRecords } from '../shared/beaconQueries'
import type { BacktestRecordRow } from '../shared/indexSuggestions'
import { useConstraintTypes } from '../shared/optimiseQueries'
import {
  useBacktestRun,
  useIndex,
  useIndexCatalogue,
  useIndices,
  useOptimiseIndex,
  useRunBacktest
} from '../shared/strategyQueries'
import { Optimiser } from './Optimiser'
import {
  DEFAULT_SETTINGS,
  settingsFindings,
  suggestDerived,
  type BacktestSettings
} from './settings'
import './BacktestView.css'

/**
 * Beacon View → Backtest (BU-174).
 *
 * The form that says what to run, the way Index Definition is the form that
 * says what an index is. Everything `BacktestRequest` accepts is a field —
 * start, end, costs and initial capital were not on screen before, so the
 * capital was hard-coded in the mutation and the period was whatever the
 * engine defaulted to.
 *
 * What the run DID is read in the Overview (BU-175). A second chart of the
 * same series in a second tab is two places to keep in step, and only one of
 * them is where anyone looks for performance.
 */
export function BacktestView({ tab, subject, pane }: ViewProps): ReactElement {
  // `pinnedDoc` is still read: a tab saved in a preset while this view was
  // pinned keeps working (BU-164).
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const setSubject = useWorkspace((state) => state.setSubject)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const [settings, setSettings] = useState<BacktestSettings>(DEFAULT_SETTINGS)
  const [ranAt, setRanAt] = useState<string | undefined>(undefined)
  /** The index this run went against — the child, when one was made. */
  const [ranFor, setRanFor] = useState<string | undefined>(undefined)
  const [derived, setDerived] = useState<string | undefined>(undefined)

  const catalogue = useIndexCatalogue()
  const indices = useIndices()
  const document = useIndex(indexId)
  const records = useBacktestRecords()
  const constraintTypes = useConstraintTypes()

  const optimise = useOptimiseIndex()
  const run = useRunBacktest()
  const jobs = useJobs((state) => state.jobs)

  const running = activeJobs(jobs).find((job) => job.kind.toLowerCase().includes('backtest'))
  const status = useBacktestRun(ranAt, ranAt !== undefined && running === undefined)

  /*
   * Already optimised, so not optimised again (BU-174).
   *
   * A solve on top of a solved index would be a third document nobody asked
   * for. The section shows this index's own terms instead, and the run goes
   * straight to the backtest.
   */
  const derivation = document.data?.derivation ?? undefined
  const willOptimise = settings.optimise && derivation === undefined
  const findings = settingsFindings({ ...settings, optimise: willOptimise }, indexId)

  /*
   * Why this run did not happen (BU-162).
   *
   * py-beacon fails a backtest whose universe resolves to nothing (BN-161).
   * Read from the job endpoint as well as the event feed, which is a socket
   * a dropped frame can leave silent.
   */
  const submitted = ranAt === undefined ? undefined : jobs[ranAt]
  const failure =
    submitted?.status === 'failed'
      ? (submitted.error ?? submitted.message)
      : status.data?.status === 'failed'
        ? (status.data.error ?? 'The engine gave no reason.')
        : undefined

  const finished = failure === undefined && running === undefined && status.data !== undefined

  const submit = (target: string): void => {
    run.mutate(
      {
        indexId: target,
        ...(settings.start === '' ? {} : { start: settings.start }),
        ...(settings.end === '' ? {} : { end: settings.end }),
        transactionCostBps: Number(settings.costBps),
        initialCapital: Number(settings.initialCapital),
        ...(settings.benchmark === '' ? {} : { benchmarkIndexId: settings.benchmark })
      },
      {
        onSuccess: (job) => {
          setRanAt(job.job_id)
          setRanFor(target)
        }
      }
    )
  }

  /*
   * Optimise, then back-test what came out.
   *
   * Two calls because they are two things: the first SAVES an index, and it
   * is that index — not the parent — whose run is being asked for. A failed
   * optimise therefore stops here rather than quietly back-testing the
   * parent, which would answer a question nobody asked.
   */
  const start = (): void => {
    setDerived(undefined)
    if (!willOptimise) {
      submit(indexId)
      return
    }

    optimise.mutate(
      {
        indexId,
        derivedId: settings.derivedId,
        derivedName: settings.derivedName,
        objective: settings.objective,
        constraints: settings.constraints
      },
      {
        onSuccess: (saved) => {
          setDerived(saved.index.id)
          submit(saved.index.id)
        }
      }
    )
  }

  const busy = optimise.isPending || run.isPending || running !== undefined
  const others = (indices.data?.indices ?? []).filter((index) => index.id !== indexId)

  return (
    <div className="backtest-view">
      <PaneHeader
        kind="query"
        subject={indexId}
        index={catalogue.rows}
        meta={describeIndex(document.data?.name, lastRun(records.data, indexId))}
        onQuery={(next) => {
          setSubject(tab.id, next.toUpperCase())
        }}
        controls={
          <>
            <Button
              disabled={indexId === ''}
              onClick={() => {
                openOrRetarget({
                  page: 'strategy-builder',
                  pane,
                  viewKind: 'index-definition',
                  title: indexId,
                  subject: indexId
                })
              }}
            >
              Open definition
            </Button>
            <Button variant="accent" disabled={busy || findings.length > 0} onClick={start}>
              {busy ? 'Running…' : 'Run backtest'}
            </Button>
          </>
        }
      />

      <Card title="Period and costs" className="backtest-card">
        <div className="backtest-form-row">
          <Field label="Start" width={140}>
            <input
              className="backtest-input"
              type="date"
              aria-label="Start"
              value={settings.start}
              onChange={(event) => {
                const start = event.target.value
                setSettings((current) => ({ ...current, start }))
              }}
            />
          </Field>

          <Field label="End" width={140}>
            <input
              className="backtest-input"
              type="date"
              aria-label="End"
              value={settings.end}
              onChange={(event) => {
                const end = event.target.value
                setSettings((current) => ({ ...current, end }))
              }}
            />
          </Field>

          <Field label="Benchmark" width={160}>
            <Select
              className="backtest-inline-select"
              options={[
                { value: '', label: 'None' },
                ...others.map((index) => ({ value: index.id, label: index.id }))
              ]}
              value={settings.benchmark}
              onChange={(benchmark) => {
                setSettings((current) => ({ ...current, benchmark }))
              }}
              label="Benchmark"
            />
          </Field>
        </div>

        <div className="backtest-form-row">
          <Field label="Transaction cost (bps)" width={180}>
            <input
              className="backtest-input"
              type="number"
              min={0}
              aria-label="Transaction cost (bps)"
              value={settings.costBps}
              onChange={(event) => {
                const costBps = event.target.value
                setSettings((current) => ({ ...current, costBps }))
              }}
            />
          </Field>

          <Field label={capitalLabel(document.data?.currency)} width={180}>
            <input
              className="backtest-input"
              type="number"
              min={0}
              aria-label="Initial capital"
              value={settings.initialCapital}
              onChange={(event) => {
                const initialCapital = event.target.value
                setSettings((current) => ({ ...current, initialCapital }))
              }}
            />
          </Field>
        </div>

        {/*
          Blank is not missing: py-beacon starts at the index base date and
          ends at the last observation it has, which beats a date this form
          could invent. Costs are bps per side, as the engine reads them.
        */}
        <p className="backtest-note type-11">
          Cost is per side. Leave a date empty to take the index’s own range — base date to last
          observation.
        </p>
      </Card>

      <Card
        title="Optimiser"
        aside={
          <Checkbox
            label={derivation === undefined ? 'Optimise first' : 'Already optimised'}
            checked={settings.optimise || derivation !== undefined}
            disabled={indexId === '' || derivation !== undefined}
            onChange={(optimise) => {
              setSettings((current) => ({
                ...current,
                optimise,
                // Filled once, while the box is untouched: overwriting what
                // was typed would be worse than leaving it blank.
                ...(optimise && current.derivedId === ''
                  ? suggested(indexId, document.data?.name ?? '')
                  : {})
              }))
            }}
          />
        }
        className="backtest-card"
      >
        {!settings.optimise && derivation === undefined && (
          <p className="backtest-note type-11">
            Off: the index is back-tested as it is defined. On, it is solved into a new optimised
            index first, and that index is what runs.
          </p>
        )}

        {(settings.optimise || derivation !== undefined) && (
          <Optimiser
            settings={settings}
            onChange={setSettings}
            types={constraintTypes.data?.types ?? {}}
            derivation={derivation}
          />
        )}
      </Card>

      {findings.length > 0 && (
        <ul className="backtest-findings type-11">
          {findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      )}

      {optimise.isError && <ViewError error={optimise.error} />}
      {run.isError && <ViewError error={run.error} />}

      {optimise.isPending && (
        <p className="backtest-note type-11">
          Solving {indexId} into {settings.derivedId}…
        </p>
      )}

      {running !== undefined && (
        <div className="backtest-progress">
          <div
            className="backtest-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(running.progress * 100)}
            aria-label="Backtest progress"
          >
            <div
              className="backtest-fill"
              style={{ width: `${String(running.progress * 100)}%` }}
            />
          </div>
          <p className="type-11">{running.message === '' ? 'Running…' : running.message}</p>
        </div>
      )}

      {failure !== undefined && (
        <div className="view-state">
          <p className="type-13">The backtest did not run.</p>
          {/* The engine's own words: it names the field to look at, which no
              paraphrase here could do as well. */}
          <p className="type-11">{failure}</p>
        </div>
      )}

      {finished && ranFor !== undefined && (
        <div className="backtest-done">
          <p className="type-13">
            Back-tested {ranFor}
            {derived === undefined ? '' : `, solved from ${indexId}`}.
          </p>
          <div className="backtest-done-actions">
            <Button
              variant="accent"
              onClick={() => {
                openOrRetarget({
                  page: 'beacon-view',
                  pane,
                  viewKind: 'overview',
                  title: ranFor,
                  subject: ranFor
                })
              }}
            >
              Open overview
            </Button>
            {derived !== undefined && (
              <Button
                onClick={() => {
                  openOrRetarget({
                    page: 'strategy-builder',
                    pane,
                    viewKind: 'index-definition',
                    title: derived,
                    subject: derived
                  })
                }}
              >
                Open {derived}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** The index's own currency, when the document has arrived to say so. */
function capitalLabel(currency: string | undefined): string {
  return currency === undefined ? 'Initial capital' : `Initial capital (${currency})`
}

function suggested(indexId: string, name: string): { derivedId: string; derivedName: string } {
  const derived = suggestDerived(indexId, name)
  return { derivedId: derived.id, derivedName: derived.name }
}

/** The index's name, and when anyone last ran this — worth knowing first. */
function describeIndex(name: string | undefined, ran: string | undefined): string | undefined {
  const parts = [name, ran].filter((part) => part !== undefined && part !== '')
  return parts.length === 0 ? undefined : parts.join(' · ')
}

/**
 * When this index was last back-tested, from the catalogue of records.
 *
 * `run_at` is null on records written before py-beacon stamped them (BN-162),
 * so "back-tested" without a date is the honest reading — inventing a time
 * from the file would be a guess dressed as data.
 */
function lastRun(
  records: readonly BacktestRecordRow[] | undefined,
  indexId: string
): string | undefined {
  if (indexId === '' || records === undefined) return undefined

  const row = records.find((record) => record.index_id === indexId)
  if (row === undefined) return 'never back-tested'

  const at = row.run_at == null ? Number.NaN : Date.parse(row.run_at)
  return Number.isNaN(at) ? 'back-tested' : `last run ${relativeTime(at, Date.now())}`
}
