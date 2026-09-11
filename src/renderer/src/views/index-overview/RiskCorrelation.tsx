import { useMemo, useState, type ReactElement } from 'react'
import { LevelChart } from '../../charts/LevelChart'
import { drawdown, maxDrawdown, type Point } from '../../charts/transform'
import { Card } from '../../components/Card/Card'
import { CheckSelect } from '../../components/CheckSelect/CheckSelect'
import { Field } from '../../components/Field/Field'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import { useThemeMode } from '../../state/theme'
import { useOverview } from '../shared/beaconQueries'
import {
  annualisedVolatility,
  fromFraction,
  percent,
  signedPercent,
  toPoints
} from '../shared/indexMetrics'
import { periodDrawdown, periodVolatility, PERIODS, type Period } from '../shared/periods'
import {
  CONFIDENCES,
  correlation,
  expectedShortfall,
  historicalVar,
  parametricVar,
  rollingCorrelation,
  rollingVolatility,
  type Confidence
} from '../shared/risk'
import { useComparisonSeries } from './comparisonSeries'

/** Trailing window for the rolling series, in observations. */
const WINDOW = 60

type ChartSeries = 'drawdown' | 'volatility' | 'correlation'

const CHART_SERIES: readonly { value: ChartSeries; label: string }[] = [
  { value: 'drawdown', label: 'Drawdown' },
  { value: 'volatility', label: `Rolling volatility · ${String(WINDOW)}d` },
  { value: 'correlation', label: `Rolling correlation · ${String(WINDOW)}d` }
]

export interface RiskCorrelationProps {
  indexId: string
  period: Period
  onPeriod: (period: Period) => void
  /** Indices to correlate against, from the catalogue. */
  benchmarks: readonly string[]
  onBenchmarks: (benchmarks: string[]) => void
  others: readonly string[]
}

interface RiskRow {
  bucket: string
  volatility: number | undefined
  drawdown: number | undefined
}

interface CorrelationRow {
  indexId: string
  correlation: number | undefined
  volatility: number | undefined
}

/**
 * Overview → Risk & Correlation (BU-176).
 *
 * One chart, three series behind a selector, because three charts of the
 * same width stacked down a pane is three things to scroll past to reach
 * the one that was wanted.
 */
export function RiskCorrelation({
  indexId,
  period,
  onPeriod,
  benchmarks,
  onBenchmarks,
  others
}: RiskCorrelationProps): ReactElement {
  const mode = useThemeMode()
  const [confidence, setConfidence] = useState<Confidence>(0.95)
  const [shown, setShown] = useState<ChartSeries>('drawdown')

  const overview = useOverview(indexId)
  const comparison = useComparisonSeries(indexId, benchmarks)

  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])
  const first = benchmarks[0]
  const against = useMemo(
    () => (first === undefined ? [] : (comparison.byId[first] ?? [])),
    [comparison.byId, first]
  )

  const rows = useMemo(() => riskRows(level, period), [level, period])
  const correlations = useMemo(
    () =>
      benchmarks.map((id) => ({
        indexId: id,
        correlation: correlation(comparison.index, comparison.byId[id] ?? []),
        volatility: annualisedVolatility(comparison.byId[id] ?? [])
      })),
    [benchmarks, comparison]
  )

  const series = useMemo(
    () => chartPoints(shown, level, comparison.index, against),
    [shown, level, comparison.index, against]
  )
  const worst = useMemo(() => maxDrawdown(drawdown(level)), [level])
  const metrics = overview.data?.metrics

  return (
    <>
      <div className="overview-controls">
        <SegmentedControl
          segments={PERIODS}
          value={period}
          onChange={onPeriod}
          label="Period"
          className="overview-period"
        />
        <Field label="Confidence" width={120}>
          <Select
            className="overview-inline-select"
            options={CONFIDENCES.map((value) => ({
              value: String(value),
              label: `${String(value * 100)}%`
            }))}
            value={String(confidence)}
            onChange={(value) => {
              setConfidence(Number(value) as Confidence)
            }}
            label="Confidence"
          />
        </Field>
        <Field label="Correlate against" width={200}>
          <CheckSelect
            options={others}
            value={benchmarks}
            onChange={onBenchmarks}
            label="Correlate against"
            placeholder="No comparators"
          />
        </Field>
      </div>

      <SummaryLine
        items={[
          {
            label: 'max drawdown',
            value: signedPercent(fromFraction(metrics?.max_drawdown), 2)
          },
          { label: 'volatility', value: percent(fromFraction(metrics?.volatility), 2) },
          {
            label: `VaR · historical`,
            value: percent(historicalVar(level, confidence), 2)
          },
          { label: 'VaR · parametric', value: percent(parametricVar(level, confidence), 2) },
          {
            label: 'expected shortfall',
            value: percent(expectedShortfall(level, confidence), 2)
          }
        ]}
      />

      <div className="overview-controls">
        <Field label="Series" width={230}>
          <Select
            className="overview-inline-select"
            options={CHART_SERIES.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={shown}
            onChange={(value) => {
              setShown(value as ChartSeries)
            }}
            label="Series"
          />
        </Field>
      </div>

      {series.length === 0 && (
        <p className="overview-note type-11">
          {shown === 'correlation' && benchmarks.length === 0
            ? 'Choose an index to correlate against.'
            : `Not enough history for a ${String(WINDOW)}-day window.`}
        </p>
      )}

      {series.length > 0 && (
        <LevelChart
          mode={mode}
          series={[{ label: labelFor(shown, first), points: series }]}
          height={360}
          note={
            shown === 'drawdown'
              ? `worst ${signedPercent(worst?.value)} on ${worst?.date ?? '—'}`
              : `${String(WINDOW)} observations, stamped at the end of each window`
          }
        />
      )}

      <Card title={`${periodLabel(period)} risk`} flush className="overview-stats-card">
        {rows.length === 0 && <p className="overview-note type-11">Not enough history yet.</p>}
        {rows.length > 0 && (
          <Table
            columns={RISK_COLUMNS}
            rows={rows}
            getRowId={(row) => row.bucket}
            maxBodyHeight={420}
          />
        )}
      </Card>

      <Card title="Correlation" flush className="overview-stats-card">
        {correlations.length === 0 && (
          <p className="overview-note type-11">
            Nothing chosen. Correlation needs something to correlate against.
          </p>
        )}
        {correlations.length > 0 && (
          <Table
            columns={CORRELATION_COLUMNS}
            rows={correlations}
            getRowId={(row) => row.indexId}
            maxBodyHeight={320}
          />
        )}
      </Card>

      <p className="overview-footnote type-11">
        VaR is one day at {String(confidence * 100)}%, as a loss · historical is the empirical
        quantile, parametric assumes a normal · correlations use daily returns on the dates every
        series shares · all derived from the level series
      </p>
    </>
  )
}

const RISK_COLUMNS: readonly Column<RiskRow>[] = [
  { key: 'bucket', header: 'Period', width: 110, emphasis: true, render: (row) => row.bucket },
  {
    key: 'volatility',
    header: 'Volatility p.a.',
    width: 130,
    align: 'right',
    render: (row) => percent(row.volatility, 2)
  },
  {
    key: 'drawdown',
    header: 'Max drawdown',
    width: 130,
    align: 'right',
    render: (row) => (row.drawdown === undefined ? '—' : <PercentCell value={row.drawdown} />)
  }
]

const CORRELATION_COLUMNS: readonly Column<CorrelationRow>[] = [
  { key: 'index', header: 'Index', width: 140, emphasis: true, render: (row) => row.indexId },
  {
    key: 'correlation',
    header: 'Correlation',
    width: 120,
    align: 'right',
    render: (row) => row.correlation?.toFixed(3) ?? '—'
  },
  {
    key: 'volatility',
    header: 'Volatility p.a.',
    width: 130,
    align: 'right',
    render: (row) => percent(row.volatility, 2)
  }
]

/** Volatility and worst drawdown per bucket, in one table rather than two. */
function riskRows(level: readonly Point[], period: Period): RiskRow[] {
  const volatility = new Map(periodVolatility(level, period).map((row) => [row.bucket, row.value]))
  const drawdowns = new Map(periodDrawdown(level, period).map((row) => [row.bucket, row.value]))
  const buckets = [...new Set([...volatility.keys(), ...drawdowns.keys()])].sort().reverse()

  return buckets.map((bucket) => ({
    bucket,
    volatility: volatility.get(bucket),
    drawdown: drawdowns.get(bucket)
  }))
}

function chartPoints(
  shown: ChartSeries,
  level: readonly Point[],
  aligned: readonly Point[],
  against: readonly Point[]
): Point[] {
  if (shown === 'drawdown') return drawdown(level)
  if (shown === 'volatility') return rollingVolatility(level, WINDOW)
  return rollingCorrelation(aligned, against, WINDOW)
}

function labelFor(shown: ChartSeries, benchmark: string | undefined): string {
  if (shown === 'drawdown') return 'drawdown'
  if (shown === 'volatility') return `volatility · ${String(WINDOW)}d`
  return `correlation vs ${benchmark ?? '—'}`
}

function periodLabel(period: Period): string {
  return PERIODS.find((entry) => entry.value === period)?.label ?? 'Period'
}
