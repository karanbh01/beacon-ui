import { useMemo, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { Field } from '../../components/Field/Field'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import { isAbsent, useBacktestRecord } from '../shared/beaconQueries'
import { percent } from '../shared/indexMetrics'
import { ViewError } from '../shared/ViewState'
import { useGroupings } from './groupings'
import {
  activeAgainst,
  aggregateBy,
  columnTotals,
  EMPTY,
  FREQUENCIES,
  fromPanel,
  fromSnapshots,
  type Frequency,
  type MatrixRow,
  type WeightMatrix
} from './weightsHistory'

type BookPayload = components['schemas']['BookPayload']

export interface WeightsOverTimeProps {
  indexId: string
  /** Subtract the benchmark's weights, making every cell an active weight. */
  active: boolean
  frequency: Frequency
  onFrequency: (frequency: Frequency) => void
  groupBy: string
  onGroupBy: (field: string) => void
  benchmark: string
  onBenchmark: (benchmark: string) => void
  others: readonly string[]
}

/**
 * Weights → Portfolio and Active (BU-177).
 *
 * Names down, dates across. One component for both faces because they are
 * one table: Active subtracts a benchmark from every cell and changes
 * nothing else about how it is read.
 *
 * The source is the stored backtest record, which carries both the decided
 * compositions (`rebalances`, BN-186) and the daily panel they drift into.
 * That means weights over time exist only for an index someone has RUN —
 * an index still being edited has no history, and this says so rather than
 * fanning out a request per date behind the reader.
 */
export function WeightsOverTime({
  indexId,
  active,
  frequency,
  onFrequency,
  groupBy,
  onGroupBy,
  benchmark,
  onBenchmark,
  others
}: WeightsOverTimeProps): ReactElement {
  const record = useBacktestRecord(indexId)
  const against = useBacktestRecord(benchmark, active && benchmark !== '')

  const mine = useMemo(
    () => matrixOf(record.data?.index?.target, frequency),
    [record.data, frequency]
  )
  const theirs = useMemo(
    () => matrixOf(against.data?.index?.target, frequency),
    [against.data, frequency]
  )

  const base = useMemo(() => (active ? activeAgainst(mine, theirs) : mine), [active, mine, theirs])

  /*
   * Every name the table will show, not just this index's.
   *
   * An active table carries the benchmark's holdings too, and asking for
   * reference data on only our own left every benchmark-only name in an
   * "Unclassified" bucket — a real underweight of 37% filed under "we could
   * not look it up".
   */
  const names = useMemo(() => base.rows.map((row) => row.key), [base])
  const groupings = useGroupings(names)

  const matrix = useMemo(
    () => (groupBy === '' ? base : aggregateBy(base, groupings.groupOf(groupBy))),
    [base, groupBy, groupings]
  )

  const totals = useMemo(() => columnTotals(matrix), [matrix])
  const columns = useMemo(() => columnsFor(matrix, groupBy, active), [matrix, groupBy, active])
  /** The engine holds a record for this index but could not serve it. */
  const broken = record.isError && !isAbsent(record.error)

  /** Nothing to subtract: no benchmark named, or one with no history. */
  const missing = active && (benchmark === '' || (!against.isPending && theirs.dates.length === 0))

  return (
    <>
      <div className="weights-controls">
        <SegmentedControl
          segments={FREQUENCIES}
          value={frequency}
          onChange={onFrequency}
          label="Frequency"
        />

        <Field label="Aggregate by" width={170}>
          <Select
            className="weights-inline-select"
            options={[
              { value: '', label: 'Constituent' },
              ...groupings.options.map((option) => ({
                value: option.field,
                label: option.label
              }))
            ]}
            value={groupBy}
            disabled={groupings.options.length === 0}
            onChange={onGroupBy}
            label="Aggregate by"
          />
        </Field>

        {active && (
          <Field label="Benchmark" width={170}>
            <Select
              className="weights-inline-select"
              options={[
                { value: '', label: 'Choose…' },
                ...others.map((id) => ({ value: id, label: id }))
              ]}
              value={benchmark}
              onChange={onBenchmark}
              label="Benchmark"
            />
          </Field>
        )}
      </div>

      {record.isPending && <p className="weights-note type-11">Reading the stored run…</p>}

      {/*
        A record the engine holds and cannot serve is a fault, not an
        absence, and "never back-tested" would be true of the wrong thing
        (py-beacon #187). The two states read differently because a reader
        can act on one of them.
      */}
      {broken && <ViewError error={record.error} />}

      {/*
        Both sources live in a backtest result, so an index nobody has run
        has no history to show. Saying so beats an empty table.
      */}
      {!record.isPending && !broken && mine.dates.length === 0 && (
        <p className="weights-note type-11">
          {indexId} has no stored run, and weights over time come from one. Back-test it to see how
          its holdings moved.
        </p>
      )}

      {missing && (
        <p className="weights-note type-11">
          Choose a benchmark to measure active weights against.
        </p>
      )}

      {/*
        A benchmark with no run of its own has no weights to subtract, and
        the arithmetic would silently produce a column of dashes. Naming the
        reason beats letting the reader wonder which side is missing.
      */}
      {active &&
        benchmark !== '' &&
        !against.isPending &&
        theirs.dates.length === 0 &&
        (against.isError && !isAbsent(against.error) ? (
          <ViewError error={against.error} />
        ) : (
          <p className="weights-note type-11">
            {benchmark} has no stored run, so there are no benchmark weights to measure against.
          </p>
        ))}

      {matrix.dates.length > 0 && !missing && (
        <>
          <SummaryLine
            items={[
              {
                label: `${String(matrix.rows.length)} rows`,
                value: groupBy === '' ? 'constituents' : 'groups'
              },
              { label: 'dates', value: String(matrix.dates.length) },
              {
                label: active ? 'Σ active' : 'Σ latest',
                // Rounded before signing, so a residue of 1e-16 does not
                // print as "−0.00%".
                value: percent(Number(((totals[totals.length - 1] ?? 0) * 100).toFixed(2)), 2)
              }
            ]}
          />

          <Table
            columns={columns}
            rows={matrix.rows}
            getRowId={(row) => row.key}
            maxBodyHeight={560}
            minColumns={4}
          />
        </>
      )}

      {matrix.dates.length > 0 && !missing && (
        <p className="weights-footnote type-11">
          {frequency === 'rebalance'
            ? 'the composition decided at each rebalance'
            : 'what was held on each date, drift included'}
          {active &&
            ` · minus ${benchmark}, so a name only the benchmark holds is a real underweight`}
          {' · '}
          {/*
            Both sources are bounded to their most recent entries, and the
            failure mode is quiet: a table that starts late without saying
            why (BN-186).
          */}
          {matrix.truncation === undefined
            ? 'the whole history'
            : `most recent ${String(matrix.truncation.served)} of ${String(matrix.truncation.total)}`}
          {groupBy !== '' && ' · groups sum to the same total as their members'}
        </p>
      )}
    </>
  )
}

/** The book's history at the asked-for frequency, or nothing yet. */
function matrixOf(book: BookPayload | null | undefined, frequency: Frequency): WeightMatrix {
  if (book == null) return EMPTY

  // `rebalances_total` carries a schema default, so it is always present;
  // `rebalances` is nullable, and null means a record written before BN-186.
  if (frequency === 'rebalance') {
    return fromSnapshots(book.rebalances ?? [], book.rebalances_total)
  }
  return fromPanel(book.weights, book.weights_dates_total, frequency)
}

function columnsFor(matrix: WeightMatrix, groupBy: string, active: boolean): Column<MatrixRow>[] {
  const head: Column<MatrixRow> = {
    key: 'name',
    header: groupBy === '' ? 'Constituent' : 'Group',
    width: 130,
    emphasis: true,
    render: (row) => row.key
  }

  // One column per date, newest LAST so the table reads left to right in
  // time — which is the direction a history is read in.
  return [
    head,
    ...matrix.dates.map((date, at) => ({
      key: date,
      header: date,
      width: 96,
      align: 'right' as const,
      render: (row: MatrixRow) => cell(row.cells[at], active)
    }))
  ]
}

/**
 * A weight, or the fact that there was none.
 *
 * A dash, not 0.00%: the name was not in the index on that date, which is a
 * different statement from holding it at nothing.
 *
 * Signed and toned only where the sign means something. A holding of 12.5%
 * is not "+12.5%" — there is no direction to it — while an active weight of
 * +12.5% is over the benchmark by that much, and the sign is the point.
 */
function cell(value: number | undefined, active: boolean): ReactElement | string {
  if (value === undefined) return '—'
  if (!active) return `${(value * 100).toFixed(2)}%`
  return <PercentCell value={value * 100} />
}
