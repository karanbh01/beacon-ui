import { useMemo, type ReactElement } from 'react'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { useThemeMode } from '../../state/theme'
import { relativeTime } from '../home/activityRows'
import { isAbsent, useBacktestRecord, useOverview, useRunResult } from '../shared/beaconQueries'
import { fromFraction, signedPercent, toPoints } from '../shared/indexMetrics'
import { useComparators, type Comparators } from './comparators'
import { describeNarrowing } from './narrowing'
import { SummaryProfile } from './SummaryProfile'
import { SummaryTable } from './SummaryTable'

export interface SummaryProps {
  strategyId: string
}

/**
 * Overview → Summary (BU-176; a strategy's run since py-beacon 0.9.0).
 *
 * What the strategy did in its latest run, against what it is measured by
 * (Karan, 2026-10-18): the index it holds, a benchmark if the run had one,
 * or — for an active strategy — the benchmark alone. The strip, the chart
 * and the table all show the same comparators, so a figure in one can be
 * found in the others.
 */
export function Summary({ strategyId }: SummaryProps): ReactElement {
  const mode = useThemeMode()
  const overview = useOverview(strategyId)
  const stored = useBacktestRecord(strategyId)
  const comparators = useComparators(strategyId)

  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])
  const narrowed = describeNarrowing(stored.data?.index?.target?.calendar_coverage)
  const result = useRunResult(strategyId)
  // The run's own drawdown series (a fraction), in the chart's percent.
  const underwater = useMemo(
    () =>
      toPoints(result.data?.drawdown).map((point) => ({
        date: point.date,
        value: point.value * 100
      })),
    [result.data]
  )
  const metrics = overview.data?.metrics
  // The run's settings are free-form; the index's id is a string when the run recorded one.
  const recorded = result.data?.settings?.index_id
  const indexId = typeof recorded === 'string' ? recorded : undefined

  /** How old the stored run is, when the engine stamped it (BN-162). */
  const captured = useMemo(() => {
    const at = stored.data?.run_at
    if (at == null) return undefined
    const when = Date.parse(at)
    return Number.isNaN(when) ? undefined : relativeTime(when, Date.now())
  }, [stored.data])

  return (
    <div className="summary-face">
      <div className="summary-grid">
        <SummaryProfile
          strategyId={strategyId}
          name={overview.data?.name ?? strategyId}
          indexId={indexId}
          currency={result.data?.currency ?? ''}
          comparators={comparators}
          figures={{
            total: fromFraction(metrics?.total_return),
            cagr: fromFraction(metrics?.annualised_return),
            volatility: fromFraction(metrics?.volatility),
            drawdown: fromFraction(metrics?.max_drawdown)
          }}
        />

        {level.length > 0 && (
          <LevelChart
            mode={mode}
            series={[
              { label: overview.data?.name ?? strategyId, points: level },
              // Only the comparators this strategy has: an absent line is
              // not a flat one.
              ...comparatorSeries(comparators)
            ]}
            panels={[
              {
                // py-beacon's performance chart: a red drawdown area under the
                // level.
                label: `Drawdown · max ${signedPercent(fromFraction(metrics?.max_drawdown))}`,
                series: [{ points: underwater, kind: 'area', tone: 'negative' }],
                share: 2,
                format: (value) => `${value.toFixed(2)}%`
              }
            ]}
            // "from", not "base": `start` is where the level series begins,
            // which is not the document's base date (BU-189).
            note={`from ${overview.data?.start ?? '—'} · ${String(overview.data?.rebalances ?? 0)} rebalances`}
            // The price and the drawdown at the height they had beside the flows,
            // which are left to Flows & AUM (Karan, 2026-11-19).
            height={420}
            reference={100}
          />
        )}
      </div>

      <SummaryTable strategyId={strategyId} />

      {/*
        A window the calendar could not cover (BN-198, BU-205). The levels
        really do span the shorter range, so the chart is correct and
        silently answers a smaller question than the one asked.
      */}
      {narrowed !== undefined && <p className="overview-note type-11">{narrowed}</p>}

      {/*
        A record the engine holds and cannot serve is a fault, not an
        absence (py-beacon #187).
      */}
      {stored.isError && !isAbsent(stored.error) && (
        <p className="overview-note type-11">
          This strategy has a stored run that could not be read: {stored.error.message}
        </p>
      )}

      <p className="overview-footnote type-11">
        {overview.data?.start ?? '—'} → {overview.data?.end ?? '—'} · last rebalance{' '}
        {overview.data?.last_rebalance ?? '—'} · effective N{' '}
        {overview.data?.concentration.effective_assets.toFixed(1) ?? '—'}
        {captured !== undefined && ` · latest run, captured ${captured}`}
      </p>
    </div>
  )
}

function comparatorSeries(comparators: Comparators): Series[] {
  return [
    ...(comparators.index === undefined || comparators.index.points.length === 0
      ? []
      : [{ label: comparators.index.id, points: comparators.index.points }]),
    ...(comparators.benchmark === undefined || comparators.benchmark.points.length === 0
      ? []
      : [
          // A benchmark in py-beacon's benchmark ink, text-secondary.
          {
            label: `${comparators.benchmark.id} · benchmark`,
            points: comparators.benchmark.points,
            tone: 'benchmark' as const
          }
        ])
  ]
}
