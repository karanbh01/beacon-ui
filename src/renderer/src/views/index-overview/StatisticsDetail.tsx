import { useMemo, type ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Table, type Column } from '../../components/Table/Table'
import { usePeriods, useOverview } from '../shared/beaconQueries'
import { PERIODS, type Period } from '../shared/periods'
import { useComparators } from './comparators'
import {
  SINCE_INCEPTION,
  statisticsMatrix,
  type StatColumn,
  type StatRow
} from './statisticsMatrix'

export interface StatisticsDetailProps {
  strategyId: string
  period: Period
  onPeriod: (period: Period) => void
}

/**
 * Overview → Statistics Detail (BU-176; by kind since Karan, 2026-10-18).
 *
 * A table for each kind of statistic (returns, risk, and the strategy
 * against each comparator it has) with the same columns in every one:
 * since inception, then each period. Every figure is py-beacon's: since
 * inception from the run, each period from `/strategies/{id}/periods`.
 */
export function StatisticsDetail({
  strategyId,
  period,
  onPeriod
}: StatisticsDetailProps): ReactElement {
  const overview = useOverview(strategyId)
  const comparators = useComparators(strategyId)

  const periods = usePeriods(strategyId, period)
  const matrix = useMemo(
    () => statisticsMatrix(overview.data?.metrics, comparators, periods.data?.periods ?? []),
    [overview.data, comparators, periods.data]
  )
  const columns = useMemo(() => columnsOf(matrix.columns), [matrix.columns])
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
      </div>

      {periods.isError && (
        <p className="overview-note type-11">
          The figures by period could not be loaded: {periods.error.message}
        </p>
      )}
      {overview.data !== undefined &&
        matrix.groups.map((group) => (
          <Section key={group.key} title={group.title}>
            <Table columns={columns} rows={group.rows} getRowId={(row) => row.key} minColumns={4} />
          </Section>
        ))}

      <p className="overview-footnote type-11">
        All figures are py-beacon’s. Each {label.toLowerCase()} column runs from the previous
        period’s close, so the periods add up to the since-inception figures.
      </p>
    </>
  )
}

function columnsOf(periods: readonly StatColumn[]): Column<StatRow>[] {
  return [
    {
      key: 'label',
      header: 'Statistic',
      width: 170,
      emphasis: true,
      rowName: true,
      render: (row) => row.label
    },
    ...periods.map((column): Column<StatRow> => ({
      key: column.key,
      header: column.label,
      width: column.key === SINCE_INCEPTION ? 110 : 86,
      align: 'right',
      render: (row) => row.values[column.key] ?? '—'
    }))
  ]
}
