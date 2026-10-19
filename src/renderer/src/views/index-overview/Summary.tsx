import { useMemo, type ReactElement } from 'react'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { relativeTime } from '../home/activityRows'
import { isAbsent, useBacktestRecord, useOverview, useRunResult } from '../shared/beaconQueries'
import { fromFraction, percent, signedPercent, toPoints, tone } from '../shared/indexMetrics'
import { useComparators, type Comparator, type Comparators } from './comparators'
import { describeNarrowing } from './narrowing'
import { summaryRows, type SummaryRow } from './summaryRows'

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
  const rows = useMemo(() => summaryRows(metrics, comparators), [metrics, comparators])

  /** How old the stored run is, when the engine stamped it (BN-162). */
  const captured = useMemo(() => {
    const at = stored.data?.run_at
    if (at == null) return undefined
    const when = Date.parse(at)
    return Number.isNaN(when) ? undefined : relativeTime(when, Date.now())
  }, [stored.data])

  return (
    <>
      <SummaryStrip
        total={fromFraction(metrics?.total_return)}
        comparators={comparators}
        cagr={fromFraction(metrics?.annualised_return)}
        volatility={fromFraction(metrics?.volatility)}
        drawdown={fromFraction(metrics?.max_drawdown)}
      />

      {level.length > 0 && (
        <div className="overview-main-row">
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
                // level, a quarter of its height.
                label: `Drawdown · max ${signedPercent(fromFraction(metrics?.max_drawdown))}`,
                series: [{ points: underwater, kind: 'area', tone: 'negative' }],
                share: 3,
                format: (value) => `${value.toFixed(2)}%`
              }
            ]}
            // "from", not "base": `start` is where the level series begins,
            // which is not the document's base date (BU-189).
            note={`from ${overview.data?.start ?? '—'} · ${String(overview.data?.rebalances ?? 0)} rebalances`}
            height={520}
            reference={100}
          />
        </div>
      )}

      <Section title="Summary statistics" className="overview-stats">
        <Table columns={columnsFor(comparators)} rows={rows} getRowId={(row) => row.key} />
      </Section>

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
    </>
  )
}

/**
 * Total Return, then each comparator's return and the strategy's lead over
 * it, then CAGR, volatility and drawdown (Karan, 2026-10-18). A comparator
 * the strategy does not have takes no space.
 */
function SummaryStrip({
  total,
  comparators,
  cagr,
  volatility,
  drawdown: worst
}: {
  total: number | undefined
  comparators: Comparators
  cagr: number | undefined
  volatility: number | undefined
  drawdown: number | undefined
}): ReactElement {
  // py-beacon's own figures for each comparator (BN-323), not worked out here.
  const against = (label: string, comparator: Comparator): ReactElement[] => {
    const theirs = fromFraction(comparator.own.total_return)
    const lead = fromFraction(comparator.relative.relative_return)
    return [
      <Stat
        key={`${label}-return`}
        label={`${label} RETURN`}
        value={signedPercent(theirs)}
        tone={tone(theirs)}
      />,
      <Stat
        key={`${label}-relative`}
        label={`REL. RETURN VS. ${label}`}
        value={signedPercent(lead, 2)}
        tone={tone(lead)}
      />
    ]
  }

  return (
    <StatStrip>
      <Stat label="TOTAL RETURN" value={signedPercent(total)} tone={tone(total)} />
      {comparators.index !== undefined && against('INDEX', comparators.index)}
      {comparators.benchmark !== undefined && against('BENCHMARK', comparators.benchmark)}
      <Stat label="CAGR" value={percent(cagr)} />
      <Stat label="VOL" value={percent(volatility)} />
      <Stat label="MAX. DRAWDOWN" value={signedPercent(worst)} tone="negative" />
    </StatStrip>
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

/*
 * Strategy, then each comparator it has as a group of two: its own
 * Performance and the strategy's Rel. Performance against it (Karan,
 * 2026-10-19).
 */
function columnsFor(comparators: Comparators): Column<SummaryRow>[] {
  const figure = (key: keyof SummaryRow, header: string, group?: string): Column<SummaryRow> => ({
    key,
    header,
    width: 110,
    align: 'right',
    ...(group === undefined ? {} : { group }),
    render: (row) => row[key]
  })
  return [
    {
      key: 'label',
      header: 'Statistic',
      width: 170,
      emphasis: true,
      rowName: true,
      render: (row) => row.label
    },
    figure('strategy', 'Strategy'),
    ...(comparators.index === undefined
      ? []
      : [figure('index', 'Performance', 'Index'), figure('vsIndex', 'Rel. Performance', 'Index')]),
    ...(comparators.benchmark === undefined
      ? []
      : [
          figure('benchmark', 'Performance', 'Benchmark'),
          figure('vsBenchmark', 'Rel. Performance', 'Benchmark')
        ])
  ]
}
