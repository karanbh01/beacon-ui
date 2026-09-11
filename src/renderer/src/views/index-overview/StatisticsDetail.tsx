import { useMemo, type ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import { useOverview } from '../shared/beaconQueries'
import { fromFraction, percent, signedPercent, toPoints } from '../shared/indexMetrics'
import {
  extremes,
  hitRate,
  periodReturns,
  periodTable,
  PERIODS,
  type Period,
  type PeriodRow
} from '../shared/periods'
import { informationRatio } from '../shared/risk'
import { useComparisonSeries } from './comparisonSeries'

export interface StatisticsDetailProps {
  indexId: string
  period: Period
  onPeriod: (period: Period) => void
  benchmark: string
  onBenchmark: (benchmark: string) => void
  /** The catalogue, minus this index: nothing measures against itself. */
  others: readonly { value: string; label: string }[]
}

/**
 * Overview → Statistics Detail (BU-176).
 *
 * Returns period by period, and the ratios that describe them. Every figure
 * is derived from the level series the Summary chart draws, because a
 * statistic fetched from a second source can disagree with the line a reader
 * just looked at (taxonomy 10).
 */
export function StatisticsDetail({
  indexId,
  period,
  onPeriod,
  benchmark,
  onBenchmark,
  others
}: StatisticsDetailProps): ReactElement {
  const overview = useOverview(indexId)
  const comparison = useComparisonSeries(indexId, benchmark === '' ? [] : [benchmark])

  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])
  const against = useMemo(() => comparison.byId[benchmark] ?? [], [comparison.byId, benchmark])

  /*
   * Against the benchmark, both series come from the comparison so they sit
   * on the dates they share. On its own, the index's own level is the whole
   * history rather than the slice some benchmark happens to cover.
   */
  const mine = benchmark === '' ? level : comparison.index
  const rows = useMemo(() => periodTable(mine, against, period), [mine, against, period])
  const own = useMemo(() => periodReturns(mine, period), [mine, period])
  const { best, worst } = useMemo(() => extremes(own), [own])

  const active = useMemo(
    () => (benchmark === '' ? undefined : informationRatio(mine, against)),
    [benchmark, mine, against]
  )

  const metrics = overview.data?.metrics
  const label = PERIODS.find((entry) => entry.value === period)?.label ?? 'Period'

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
        <Field label="Benchmark" width={180}>
          <Select
            className="overview-inline-select"
            options={[{ value: '', label: 'None' }, ...others]}
            value={benchmark}
            onChange={onBenchmark}
            label="Benchmark"
          />
        </Field>
      </div>

      <SummaryLine
        items={[
          { label: 'Sharpe', value: metrics?.sharpe_ratio.toFixed(2) ?? '—' },
          {
            label: 'information ratio',
            value:
              active === undefined
                ? 'pick a benchmark'
                : (active.ratio?.toFixed(2) ?? 'no active risk')
          },
          {
            label: 'tracking error',
            value:
              active === undefined
                ? percent(fromFraction(metrics?.tracking_error), 2)
                : percent(active.trackingError, 2)
          },
          {
            label: 'excess p.a.',
            value: active === undefined ? '—' : signedPercent(active.excess, 2)
          },
          { label: `hit rate · ${label.toLowerCase()}`, value: percent(hitRate(mine, period), 1) },
          { label: `best ${label.toLowerCase()}`, value: describe(best) },
          { label: `worst ${label.toLowerCase()}`, value: describe(worst) }
        ]}
      />

      <Card title={`${label} returns`} flush className="overview-stats-card">
        {/* The comparison is a second request, and a benchmark that failed
            to load must not read as a benchmark that did nothing. */}
        {comparison.isError && (
          <p className="overview-note type-11">
            {benchmark} could not be loaded to compare against.
          </p>
        )}
        {rows.length === 0 && !comparison.isError && (
          <p className="overview-note type-11">Not enough history yet.</p>
        )}
        {rows.length > 0 && (
          <Table
            columns={columnsFor(indexId, benchmark)}
            rows={rows}
            getRowId={(row) => row.bucket}
            maxBodyHeight={520}
          />
        )}
      </Card>

      <p className="overview-footnote type-11">
        {rows.length.toLocaleString('en-US')} {label.toLowerCase()} periods · each measured from the
        previous period’s close, so the first day of a period counts in it · derived from the level
        series
        {benchmark !== '' && ` · excess and tracking error against ${benchmark}, on shared dates`}
      </p>
    </>
  )
}

function describe(row: { bucket: string; value: number } | undefined): string {
  return row === undefined ? '—' : `${row.bucket} ${signedPercent(row.value, 1)}`
}

function columnsFor(indexId: string, benchmark: string): Column<PeriodRow>[] {
  const columns: Column<PeriodRow>[] = [
    { key: 'bucket', header: 'Period', width: 110, emphasis: true, render: (row) => row.bucket },
    {
      key: 'index',
      header: indexId === '' ? 'Index' : indexId,
      width: 110,
      align: 'right',
      render: (row) => (row.index === undefined ? '—' : <PercentCell value={row.index} />)
    }
  ]

  // Two columns that would be empty rather than informative, so neither is
  // drawn until there is a benchmark to fill them.
  if (benchmark !== '') {
    columns.push(
      {
        key: 'benchmark',
        header: benchmark,
        width: 110,
        align: 'right',
        render: (row) => (row.benchmark === undefined ? '—' : <PercentCell value={row.benchmark} />)
      },
      {
        key: 'excess',
        header: 'Excess',
        width: 110,
        align: 'right',
        render: (row) => (row.excess === undefined ? '—' : <PercentCell value={row.excess} />)
      }
    )
  }

  return columns
}
