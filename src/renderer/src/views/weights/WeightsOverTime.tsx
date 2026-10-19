import { useMemo, useState, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { Checkbox } from '../../components/Checkbox/Checkbox'
import { Field } from '../../components/Field/Field'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import { isAbsent, useBacktestRecord } from '../shared/beaconQueries'
import { percent } from '../shared/indexMetrics'
import { bucketOf } from '../shared/periods'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import {
  holdingColumns,
  useReferenceColumns,
  type ReferenceColumn,
  type ReferenceValues
} from '../shared/holdingColumns'
import { HoldingColumnsButton } from '../shared/HoldingColumnsButton'
import { useGroupings } from './groupings'
import {
  activeAgainst,
  aggregateBy,
  alongside,
  columnTotals,
  EMPTY,
  FREQUENCIES,
  fromPanel,
  fromPanelOn,
  fromSnapshots,
  type Frequency,
  type MatrixRow,
  type WeightMatrix
} from './weightsHistory'

type BookPayload = components['schemas']['BookPayload']
type RecordPayload = components['schemas']['BacktestResultSummary']

export interface WeightsOverTimeProps {
  strategyId: string
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
  strategyId,
  active,
  frequency,
  onFrequency,
  groupBy,
  onGroupBy,
  benchmark,
  onBenchmark,
  others
}: WeightsOverTimeProps): ReactElement {
  const reference = useReferenceColumns(TABLE)
  const record = useBacktestRecord(strategyId, true, reference.fields)
  // The index's and the benchmark's weights beside the fund's (Karan, 2026-10-19).
  const [showIndex, setShowIndex] = useState(false)
  const [showBenchmark, setShowBenchmark] = useState(false)
  const hasBenchmark = record.data?.benchmark != null
  const against = useBacktestRecord(benchmark, active && benchmark !== '', reference.fields)

  /*
   * The fund's own book: what it held (Karan, 2026-10-19). The index's
   * target book is what the index decided, before the implementation's
   * screens, caps and cash.
   */
  const mine = useMemo(() => matrixOf(record.data, frequency), [record.data, frequency])
  const theirs = useMemo(() => matrixOf(against.data, frequency), [against.data, frequency])

  /*
   * With the index or the benchmark shown, each date becomes a group of
   * Portfolio, Index and Benchmark columns. The index's book is what it
   * decided at each rebalance, or held at each month or quarter end; the
   * benchmark's the same, from the run's own benchmark.
   */
  const shown = useMemo(() => {
    if (active || record.data === undefined) return mine
    const books = [
      { label: 'Portfolio', matrix: mine },
      ...(showIndex
        ? [{ label: 'Index', matrix: bookOf(record.data.index?.target, frequency) }]
        : []),
      ...(showBenchmark && hasBenchmark
        ? [{ label: 'Benchmark', matrix: bookOf(record.data.benchmark, frequency) }]
        : [])
    ]
    return alongside(books, (date) =>
      frequency === 'rebalance' ? date.slice(0, 10) : bucketOf(date, frequency)
    )
  }, [active, record.data, mine, showIndex, showBenchmark, hasBenchmark, frequency])

  const base = useMemo(
    () => (active ? activeAgainst(mine, theirs) : shown),
    [active, mine, theirs, shown]
  )

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
  /*
   * Each name as it is classified now: the latest of the windows the record
   * carries over the panel (BN-325). A name only the benchmark holds is read
   * from the benchmark's record.
   */
  const referenceOf = useMemo(() => {
    const latest = new Map<string, ReferenceValues>([
      ...latestOf(against.data?.portfolio.reference_windows),
      ...latestOf(record.data?.benchmark?.reference_windows),
      ...latestOf(record.data?.index?.target?.reference_windows),
      ...latestOf(record.data?.portfolio.reference_windows)
    ])
    return (row: MatrixRow): ReferenceValues => latest.get(row.key)
  }, [record.data, against.data])
  const columns = useMemo(
    () => columnsFor(matrix, groupBy, active, referenceOf, reference.columns),
    [matrix, groupBy, active, referenceOf, reference.columns]
  )
  /*
   * Only what the table does not already say (Karan, 2026-10-19): the
   * rebalance view and a complete history need no line under them.
   */
  const footnote = [
    ...(frequency === 'rebalance' ? [] : ['what was held on each date, drift included']),
    ...(active
      ? [`minus ${benchmark}, so a name only the benchmark holds is a real underweight`]
      : []),
    // Both sources are bounded to their most recent entries, and the failure
    // mode is quiet: a table that starts late without saying why (BN-186).
    ...(matrix.truncation === undefined
      ? []
      : [`most recent ${String(matrix.truncation.served)} of ${String(matrix.truncation.total)}`]),
    ...(groupBy === '' ? [] : ['groups sum to the same total as their members'])
  ]

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

        {!active && (
          <div className="weights-alongside">
            <Checkbox label="Index" checked={showIndex} onChange={setShowIndex} />
            <Checkbox
              label="Benchmark"
              checked={showBenchmark && hasBenchmark}
              disabled={!hasBenchmark}
              onChange={setShowBenchmark}
            />
          </div>
        )}

        {active && (
          <Field label="Benchmark" width={170}>
            <Select
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
        <ViewEmpty figure="drawer">
          {strategyId} has no run yet. Backtest it to see how its holdings moved.
        </ViewEmpty>
      )}

      {missing && (
        <ViewEmpty figure="ticker">Choose a benchmark to measure active weights against.</ViewEmpty>
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
          <ViewEmpty figure="drawer">
            {benchmark} has no run yet, so there are no benchmark weights to measure against.
          </ViewEmpty>
        ))}

      {matrix.dates.length > 0 && !missing && (
        <>
          <SummaryLine
            items={[
              {
                label: `${String(matrix.rows.length)} rows`,
                value: groupBy === '' ? 'constituents' : 'groups'
              },
              { label: 'dates', value: String(new Set(matrix.dates).size) },
              {
                label: active ? 'Σ active' : 'Σ latest',
                // Rounded before signing, so a residue of 1e-16 does not
                // print as "−0.00%".
                value: percent(Number(((latestOwn(matrix, totals) ?? 0) * 100).toFixed(2)), 2)
              }
            ]}
          />

          <Table
            columns={columns}
            rows={matrix.rows}
            getRowId={(row) => row.key}
            maxBodyHeight={560}
            minColumns={4}
            queryable
            {...(groupBy === '' ? { headerAction: <HoldingColumnsButton table={TABLE} /> } : {})}
          />
        </>
      )}

      {matrix.dates.length > 0 && !missing && footnote.length > 0 && (
        <p className="weights-footnote type-11">{footnote.join(' · ')}</p>
      )}
    </>
  )
}

/**
 * The fund's history at the asked-for frequency, or nothing yet: its daily
 * weights, on the index's rebalance days or at each month's or quarter's
 * end.
 */
function matrixOf(record: RecordPayload | undefined, frequency: Frequency): WeightMatrix {
  if (record === undefined) return EMPTY
  const book = record.portfolio

  if (frequency === 'rebalance') {
    // `rebalances` is nullable: null means a record written before BN-186.
    const days = (record.index?.target?.rebalances ?? []).map((snapshot) => snapshot.date)
    return fromPanelOn(book.weights, book.weights_dates_total, days)
  }
  return fromPanel(book.weights, book.weights_dates_total, frequency)
}

/**
 * The latest total of the fund's own book: the last column, or with the
 * index and benchmark beside it, the last Portfolio column.
 */
function latestOwn(
  matrix: WeightMatrix,
  totals: readonly (number | undefined)[]
): number | undefined {
  const own = matrix.books?.lastIndexOf('Portfolio') ?? totals.length - 1
  return totals[own]
}

/** An index's book (the tracked index, or the benchmark) at the asked-for frequency. */
function bookOf(book: BookPayload | null | undefined, frequency: Frequency): WeightMatrix {
  if (book == null) return EMPTY
  if (frequency === 'rebalance') return fromSnapshots(book.rebalances ?? [], book.rebalances_total)
  return fromPanel(book.weights, book.weights_dates_total, frequency)
}

/** This table's own column choice, under Asset → Holding columns. */
const TABLE = 'holdings-history'

type Windows = Record<string, components['schemas']['ReferenceWindow'][]> | null | undefined

/** Each name's latest window: the classification it holds at the end of the panel. */
function latestOf(windows: Windows): [string, ReferenceValues][] {
  return Object.entries(windows ?? {}).map(([identifier, spans]) => {
    const last = [...spans].sort((one, other) => one.date_from.localeCompare(other.date_from)).pop()
    return [identifier, last?.reference]
  })
}

function columnsFor(
  matrix: WeightMatrix,
  groupBy: string,
  active: boolean,
  referenceOf: (row: MatrixRow) => ReferenceValues,
  reference: readonly ReferenceColumn[]
): Column<MatrixRow>[] {
  // A holding's row reads like every other ticker table's; a group's row is
  // a sector or a country, with nothing more to say about it.
  const head: Column<MatrixRow>[] =
    groupBy === ''
      ? holdingColumns<MatrixRow>((row) => row.key, referenceOf, reference)
      : [
          {
            key: 'name',
            header: 'Group',
            width: 130,
            emphasis: true,
            render: (row) => row.key,
            value: (row) => row.key
          }
        ]

  // One column per date, newest LAST so the table reads left to right in
  // time — which is the direction a history is read in. With books side by
  // side, the date heads a group and each column is named for its book.
  return [
    ...head,
    ...matrix.dates.map((date, at) => {
      const book = matrix.books?.[at]
      return {
        key: book === undefined ? date : `${date}-${book}`,
        header: book ?? date,
        ...(book === undefined ? {} : { group: date }),
        width: book === undefined ? 96 : 84,
        align: 'right' as const,
        render: (row: MatrixRow) => cell(row.cells[at], active),
        value: (row: MatrixRow) => {
          const value = row.cells[at]
          return value === undefined ? undefined : value * 100
        }
      }
    })
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
