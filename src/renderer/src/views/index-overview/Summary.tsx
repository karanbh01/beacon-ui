import { useMemo, type ReactElement } from 'react'
import type { RunMetrics } from '@shared/backtestRun'
import { parseRecord } from '@shared/backtestRun'
import { LevelChart } from '../../charts/LevelChart'
import { drawdown, maxDrawdown, type Point } from '../../charts/transform'
import { Card } from '../../components/Card/Card'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { WeightBar } from '../../components/WeightBar/WeightBar'
import { useThemeMode } from '../../state/theme'
import { relativeTime } from '../home/activityRows'
import { isAbsent, useBacktestRecord, useOverview, useWeights } from '../shared/beaconQueries'
import {
  fromFraction,
  lastValue,
  oneDay,
  percent,
  signedPercent,
  sinceStart,
  toPoints,
  tone,
  weightRows,
  yearToDate
} from '../shared/indexMetrics'
import { hitRate } from '../shared/periods'
import { toPoints as runPoints } from '../shared/seriesStats'

export interface SummaryProps {
  indexId: string
}

interface StatRow {
  label: string
  index: string
  portfolio: string
}

/**
 * Overview → Summary (BU-176).
 *
 * What the index did, and what the simulated portfolio did if anyone has
 * run one. The stored run lands here rather than on the Backtest tab, which
 * is a form now (BU-174): this is where performance is read, and the same
 * series drawn in two places is two places to keep in step.
 */
export function Summary({ indexId }: SummaryProps): ReactElement {
  const mode = useThemeMode()
  const overview = useOverview(indexId)
  const weights = useWeights(indexId)
  const stored = useBacktestRecord(indexId)

  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])
  const run = useMemo(() => parseRecord(stored.data), [stored.data])
  const nav = useMemo(() => runPoints(run?.level), [run])

  const worst = useMemo(() => maxDrawdown(drawdown(level)), [level])
  const top = useMemo(
    () => weightRows(weights.data?.weights ?? {}, weights.data?.capped ?? []).slice(0, 10),
    [weights.data]
  )

  const metrics = overview.data?.metrics
  const rows = useMemo(
    () => statRows(metrics, level, run?.metrics, nav),
    [metrics, level, run, nav]
  )

  /** How old the stored run is, when the engine stamped it (BN-162). */
  const captured = useMemo(() => {
    const at = stored.data?.run_at
    if (at == null) return undefined
    const when = Date.parse(at)
    return Number.isNaN(when) ? undefined : relativeTime(when, Date.now())
  }, [stored.data])

  return (
    <>
      <StatStrip>
        <Stat label="INDEX LEVEL" value={lastValue(level)?.toFixed(2) ?? '—'} />
        <Stat label="1D" value={signedPercent(oneDay(level), 2)} tone={tone(oneDay(level))} />
        <Stat label="YTD" value={signedPercent(yearToDate(level))} tone={tone(yearToDate(level))} />
        <Stat label="SINCE BASE" value={signedPercent(sinceStart(level))} />
        <Stat label="CAGR" value={percent(fromFraction(metrics?.annualised_return))} />
        <Stat label="VOL" value={percent(fromFraction(metrics?.volatility))} />
        <Stat label="SHARPE" value={metrics?.sharpe_ratio.toFixed(2) ?? '—'} />
        <Stat
          label="MAX DD"
          value={signedPercent(fromFraction(metrics?.max_drawdown))}
          tone="negative"
        />
      </StatStrip>

      {level.length > 0 && (
        <div className="overview-main-row">
          <LevelChart
            mode={mode}
            series={[
              { label: indexId, points: level },
              // The simulated book beside the index it tracked. Only when a
              // run exists: an absent line is not a flat one.
              ...(nav.length === 0 ? [] : [{ label: `${indexId} portfolio`, points: nav }])
            ]}
            panels={[
              {
                label: `drawdown · max ${signedPercent(worst?.value)}`,
                series: [{ points: drawdown(level), kind: 'area' }]
              }
            ]}
            note={`base ${overview.data?.start.slice(0, 10) ?? '—'} · ${String(overview.data?.rebalances ?? 0)} rebalances`}
            height={520}
          />

          <Card title="Top constituents" className="overview-constituents">
            {top.length === 0 && <p className="type-11">No weights published yet.</p>}
            {top.map((row) => (
              <div className="overview-weight" key={row.ticker}>
                <span className="overview-ticker">{row.ticker}</span>
                <WeightBar
                  share={row.share}
                  tone={row.capped ? 'accent' : 'default'}
                  label={`${row.ticker} ${(row.weight * 100).toFixed(2)}%`}
                />
                <span className="overview-weight-value">{(row.weight * 100).toFixed(2)}%</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      <Card title="Summary statistics" flush className="overview-stats-card">
        <Table
          columns={columnsFor(nav.length > 0)}
          rows={rows}
          getRowId={(row) => row.label}
          maxBodyHeight={420}
        />
      </Card>

      {/*
        A record the engine holds and cannot serve is a fault, not an
        absence (py-beacon #187). Without this the Portfolio column simply
        does not appear, which reads as "nobody ran one" — true of the
        wrong thing, and the same mistake BU-162 fixed for a failed job.
      */}
      {stored.isError && !isAbsent(stored.error) && (
        <p className="overview-note type-11">
          This index has a stored run that could not be read: {stored.error.message}
        </p>
      )}

      <p className="overview-footnote type-11">
        {overview.data?.start.slice(0, 10) ?? '—'} → {overview.data?.end.slice(0, 10) ?? '—'} · last
        rebalance {overview.data?.last_rebalance.slice(0, 10) ?? '—'} · effective N{' '}
        {overview.data?.concentration.effective_assets.toFixed(1) ?? '—'} · 1D, YTD, since-base and
        the hit rate are derived from the level series
        {/*
          Which run the portfolio column describes (BU-169). A stored one may
          predate the definition on screen, and its NAV opens at day zero
          rather than the first traded close.
        */}
        {nav.length > 0 &&
          ` · portfolio from the stored run${captured === undefined ? '' : `, captured ${captured}`}`}
      </p>
    </>
  )
}

function columnsFor(hasRun: boolean): Column<StatRow>[] {
  const columns: Column<StatRow>[] = [
    { key: 'label', header: 'Statistic', width: 180, emphasis: true, render: (row) => row.label },
    { key: 'index', header: 'Index', width: 120, align: 'right', render: (row) => row.index }
  ]

  // Only where there is a run: an empty column reads as a measurement that
  // came out blank rather than one nobody made.
  if (hasRun) {
    columns.push({
      key: 'portfolio',
      header: 'Portfolio',
      width: 120,
      align: 'right',
      render: (row) => row.portfolio
    })
  }
  return columns
}

/**
 * The headline figures, index beside portfolio.
 *
 * The index column is py-beacon's own `metrics` where it has them — the
 * engine computed the index, so its Sharpe is the answer, not ours. Only
 * the hit rate is derived here, because `BacktestMetrics` has no such field
 * and the level series contains it exactly.
 */
function statRows(
  metrics: RunMetrics | undefined,
  level: readonly Point[],
  run: RunMetrics | undefined,
  nav: readonly Point[]
): StatRow[] {
  const pair = (
    label: string,
    pick: (from: RunMetrics | undefined) => number | null | undefined,
    format: (value: number | undefined) => string
  ): StatRow => ({
    label,
    index: format(fromFraction(pick(metrics))),
    portfolio: format(fromFraction(pick(run)))
  })

  return [
    pair(
      'Total return',
      (m) => m?.total_return,
      (value) => signedPercent(value, 2)
    ),
    pair(
      'Annualised return',
      (m) => m?.annualised_return,
      (value) => signedPercent(value, 2)
    ),
    pair(
      'Volatility',
      (m) => m?.volatility,
      (value) => percent(value, 2)
    ),
    {
      label: 'Sharpe ratio',
      index: metrics?.sharpe_ratio?.toFixed(2) ?? '—',
      portfolio: run?.sharpe_ratio?.toFixed(2) ?? '—'
    },
    pair(
      'Max drawdown',
      (m) => m?.max_drawdown,
      (value) => signedPercent(value, 2)
    ),
    pair(
      'Tracking error',
      (m) => m?.tracking_error,
      (value) => percent(value, 2)
    ),
    pair(
      'Tracking difference',
      (m) => m?.tracking_difference,
      (value) => signedPercent(value, 2)
    ),
    {
      label: 'Hit rate · monthly',
      index: percent(hitRate(level, 'monthly'), 1),
      portfolio: percent(hitRate(nav, 'monthly'), 1)
    }
  ]
}
