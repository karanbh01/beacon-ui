import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { activeJobs, useJobs } from '../../api/jobs'
import { LevelChart } from '../../charts/LevelChart'
import { drawdown } from '../../charts/transform'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { useThemeMode } from '../../state/theme'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  useBacktestRun,
  useCompare,
  useIndexOverview,
  useIndices,
  useRunBacktest
} from '../shared/strategyQueries'
import { AnnualReturns } from './AnnualReturns'
import {
  annualTable,
  cagr,
  fromFraction,
  monthlyHitRate,
  signedPercent,
  toPoints
} from './backtest'
import './BacktestView.css'

const COSTS = [0, 1, 5, 10, 25].map((bps) => ({
  value: String(bps),
  label: `${String(bps)} bps per side`
}))

/**
 * Beacon View → Backtest. Figma 234:8294.
 *
 * The job flow end to end: submit, watch progress on the event feed, then
 * read the result back from `/beacon/{id}/overview` — `JobStatus.result` is
 * typed `unknown`, so the pane asks the endpoint that has a schema.
 *
 * Figma's strip also shows Sortino, hit rate and turnover. Hit rate is a
 * plain count over the level series and is computed here; Sortino needs a
 * minimum-acceptable-return convention the engine has not stated, and
 * turnover needs the weights at every rebalance, which the overview does not
 * carry. Both are left out rather than guessed.
 */
export function BacktestView({ tab, subject }: ViewProps): ReactElement {
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const [benchmark, setBenchmark] = useState('')
  const [costBps, setCostBps] = useState('5')
  const [ranAt, setRanAt] = useState<string | undefined>(undefined)

  const mode = useThemeMode()
  const indices = useIndices()
  const run = useRunBacktest()
  const jobs = useJobs((state) => state.jobs)

  // Ask for the result only once a backtest has been run in this session, or
  // the pane would show a stale overview as though it were this run's.
  const overview = useIndexOverview(indexId, ranAt !== undefined)
  const compare = useCompare(benchmark === '' ? [] : [indexId, benchmark])

  const running = activeJobs(jobs).find((job) => job.kind.toLowerCase().includes('backtest'))

  /*
   * The run itself, read from the job (BU-137).
   *
   * The overview answers what the INDEX did when recalculated; this answers
   * what the simulated portfolio did — which is what a backtest pane is for,
   * and was not on screen before.
   */
  const runResult = useBacktestRun(ranAt, ranAt !== undefined && running === undefined)
  const runData = runResult.data

  const { refetch } = overview
  useEffect(() => {
    if (ranAt === undefined || running !== undefined) return
    void refetch()
  }, [ranAt, running, refetch])

  /*
   * The portfolio's NAV where there is one, the index's level otherwise.
   *
   * Both are rebased to 100 on the first TRADING day — the run payload
   * carries no day-zero row, so there is nothing to drop here. Day zero
   * lives on `portfolio.nav` in the record payload, which has no route yet;
   * a view that reads it will have to decide, per chart, whether the
   * starting capital is part of the story.
   */
  const nav = useMemo(() => toPoints(runData?.level), [runData])
  const level = useMemo(
    () => (nav.length > 0 ? nav : toPoints(overview.data?.level)),
    [nav, overview.data]
  )
  /** The index this portfolio was tracking, from the run (was `benchmark_level`). */
  const trackedLevel = useMemo(() => toPoints(runData?.indexLevel), [runData])
  const benchmarkLevel = useMemo(() => {
    const entry = compare.data?.entries.find((candidate) => candidate.index_id === benchmark)
    return toPoints(entry?.level)
  }, [compare.data, benchmark])

  const annual = useMemo(() => annualTable(level, benchmarkLevel), [level, benchmarkLevel])
  const metrics = runData?.metrics ?? overview.data?.metrics
  const benchmarkCagr = benchmarkLevel.length === 0 ? undefined : cagr(benchmarkLevel)
  const indexCagr = fromFraction(metrics?.annualised_return) ?? cagr(level)

  /*
   * Not measured, which is not the same as flat (BU-137).
   *
   * A run given no benchmark comes back with `benchmark: null`, and saying
   * "—" for its numbers would read as a measurement that happened to be
   * nothing. Only a run that HAS one gets the comparison row.
   */
  const measuredBenchmark = runData?.benchmark !== undefined

  const others = (indices.data?.indices ?? []).filter((index) => index.id !== indexId)

  return (
    <div className="backtest-view">
      <PaneHeader
        kind="fields"
        controls={
          <Button
            variant="accent"
            disabled={indexId === '' || run.isPending || running !== undefined}
            onClick={() => {
              run.mutate(
                {
                  indexId,
                  transactionCostBps: Number(costBps),
                  ...(benchmark === '' ? {} : { benchmarkIndexId: benchmark })
                },
                {
                  onSuccess: (job) => {
                    setRanAt(job.job_id)
                  }
                }
              )
            }}
          >
            {running === undefined ? 'Run backtest' : 'Running…'}
          </Button>
        }
      >
        <Field label="Index" width={160} value={indexId === '' ? '—' : indexId} />
        <Field label="Benchmark" width={160}>
          <Select
            className="backtest-inline-select"
            options={[
              { value: '', label: 'None' },
              ...others.map((i) => ({ value: i.id, label: i.id }))
            ]}
            value={benchmark}
            onChange={setBenchmark}
            label="Benchmark"
          />
        </Field>
        <Field label="Costs" width={140}>
          <Select
            className="backtest-inline-select"
            options={COSTS}
            value={costBps}
            onChange={setCostBps}
            label="Costs"
          />
        </Field>
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Pin this pane to an index to back-test it.</ViewEmpty>}
      {run.isError && <ViewError error={run.error} />}

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

      {ranAt === undefined && indexId !== '' && running === undefined && (
        <ViewEmpty>No backtest run yet in this session.</ViewEmpty>
      )}

      {overview.isPending && ranAt !== undefined && running === undefined && (
        <ViewLoading what={indexId} />
      )}
      {overview.isError && <ViewError error={overview.error} />}

      {level.length > 0 && (
        <>
          <StatStrip>
            <Stat label="CAGR" value={signedPercent(indexCagr)} />
            {benchmark !== '' && (
              <Stat label="BENCHMARK CAGR" value={signedPercent(benchmarkCagr)} />
            )}
            {benchmark !== '' && (
              <Stat
                label="EXCESS"
                value={
                  indexCagr === undefined || benchmarkCagr === undefined
                    ? '—'
                    : signedPercent(indexCagr - benchmarkCagr)
                }
                tone={
                  indexCagr !== undefined &&
                  benchmarkCagr !== undefined &&
                  indexCagr >= benchmarkCagr
                    ? 'positive'
                    : 'negative'
                }
              />
            )}
            {runData !== undefined && !measuredBenchmark && benchmark === '' && (
              <Stat label="BENCHMARK" value="not measured" />
            )}
            <Stat label="VOL" value={signedPercent(fromFraction(metrics?.volatility)).slice(1)} />
            {/* Nullable now that this may come from the run, where every
                metric is optional — the overview's was not. */}
            <Stat label="SHARPE" value={metrics?.sharpe_ratio?.toFixed(2) ?? '—'} />
            <Stat
              label="MAX DD"
              value={signedPercent(fromFraction(metrics?.max_drawdown))}
              tone="negative"
            />
            <Stat label="HIT RATE · MO" value={signedPercent(monthlyHitRate(level)).slice(1)} />
            <Stat label="TOTAL RETURN" value={signedPercent(fromFraction(metrics?.total_return))} />
          </StatStrip>

          <div className="backtest-main-row">
            <LevelChart
              mode={mode}
              series={[
                { label: nav.length > 0 ? `${indexId} portfolio` : indexId, points: level },
                // The tracked index, when the run reported one — the line
                // that says how closely the portfolio replicated it.
                ...(trackedLevel.length === 0
                  ? []
                  : [{ label: `${indexId} index`, points: trackedLevel }]),
                ...(benchmarkLevel.length === 0
                  ? []
                  : [{ label: benchmark, points: benchmarkLevel }])
              ]}
              panels={[{ label: 'drawdown', series: [{ points: drawdown(level), kind: 'area' }] }]}
              height={560}
              {...(overview.data === undefined
                ? {}
                : {
                    note: `${overview.data.start.slice(0, 10)} → ${overview.data.end.slice(0, 10)} · ${String(overview.data.rebalances)} rebalances`
                  })}
            />

            <AnnualReturns
              rows={annual}
              indexId={indexId}
              {...(benchmark === '' ? {} : { benchmarkId: benchmark })}
            />
          </div>

          <p className="backtest-footnote type-11">
            {overview.data?.observations.toLocaleString('en-US') ?? '—'} observations · costs{' '}
            {costBps} bps per side
            {runData?.totalCosts === undefined
              ? ''
              : ` (${Math.round(runData.totalCosts).toLocaleString('en-US')} paid)`}{' '}
            · {nav.length > 0 ? 'portfolio NAV against the tracked index' : 'index level'} · annual
            returns and the monthly hit rate are derived from the level series
          </p>
        </>
      )}
    </div>
  )
}
