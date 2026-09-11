import { useMemo, type ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { DeltaCell, PercentCell } from '../../components/Table/cells'
import { useWorkspace } from '../../state/tabs.store'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useWeights } from '../shared/beaconQueries'
import { constituentRows, percent, weightRows, type WeightRow } from '../shared/indexMetrics'

export interface WeightDetailProps {
  indexId: string
  page: string
  pane: number | undefined
  asof: string
  onAsof: (asof: string) => void
  benchmark: string
  onBenchmark: (benchmark: string) => void
  others: readonly string[]
}

/** A constituent, with the benchmark's view of it beside our own. */
interface DetailRow extends WeightRow {
  benchmark: number | undefined
  active: number | undefined
}

/**
 * Weights → Weight Detail. Figma 234:8155.
 *
 * Cross-sectional: what was held at one date. The bar lane went in BU-177 —
 * a weight is already a number in the column beside it, and the lane was
 * competing with the two columns that actually say something new, the
 * benchmark's weight and the difference from it.
 *
 * The benchmark comes from `/beacon/{id}/weights` at the same date rather
 * than from a stored run, so it works for any index in the catalogue
 * whether or not anyone has back-tested it.
 */
export function WeightDetail({
  indexId,
  page,
  pane,
  asof,
  onAsof,
  benchmark,
  onBenchmark,
  others
}: WeightDetailProps): ReactElement {
  const weights = useWeights(indexId, asof)
  const against = useWeights(benchmark, asof)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  // Prefer the per-constituent rows; fall back to the identifier→fraction
  // map, because a response without `rows` is still a valid one and the
  // table should draw what it can rather than nothing.
  const rows = useMemo(() => {
    const detailed = weights.data?.rows
    const base =
      detailed !== undefined && detailed.length > 0
        ? constituentRows(detailed)
        : weightRows(weights.data?.weights ?? {}, weights.data?.capped ?? [])

    return withBenchmark(base, benchmark === '' ? undefined : (against.data?.weights ?? {}))
  }, [weights.data, against.data, benchmark])

  const concentration = weights.data?.concentration
  const drift = weights.data?.drift
  const total = rows.reduce((sum, row) => sum + row.weight, 0)

  return (
    <>
      <div className="weights-controls">
        <Field label="As of" width={130}>
          <input
            className="weights-input"
            type="date"
            aria-label="As of"
            value={asof}
            onChange={(event) => {
              onAsof(event.target.value)
            }}
          />
        </Field>
        <Field
          label="Rebalance"
          width={150}
          value={weights.data?.rebalance_date.slice(0, 10) ?? '—'}
        />
        <Field label="Benchmark" width={170}>
          <Select
            className="weights-inline-select"
            options={[
              { value: '', label: 'None' },
              ...others.map((id) => ({ value: id, label: id }))
            ]}
            value={benchmark}
            onChange={onBenchmark}
            label="Benchmark"
          />
        </Field>
      </div>

      {indexId === '' && <ViewEmpty>Name an index in Overview — this pane follows it.</ViewEmpty>}
      {weights.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {weights.isError && <ViewError error={weights.error} />}

      {weights.isSuccess && (
        <>
          <SummaryLine
            items={[
              {
                label: `${String(rows.length)} constituents`,
                value: `Σ ${percent(total * 100, 2)}`
              },
              {
                label: 'top-5 weight',
                // An index with fewer than five names has no '5' bucket, and
                // 0.0% there is the largest possible understatement of the
                // thing this figure measures (BU-184).
                value:
                  concentration?.top_weights['5'] === undefined
                    ? '—'
                    : percent(concentration.top_weights['5'] * 100)
              },
              { label: 'HHI', value: concentration?.herfindahl.toFixed(3) ?? '—' },
              { label: 'effective N', value: concentration?.effective_assets.toFixed(1) ?? '—' },
              { label: 'capped', value: String(weights.data.capped?.length ?? 0) },
              {
                label: 'drift since rebalance',
                value: drift == null ? 'first rebalance' : percent(drift.turnover * 100)
              }
            ]}
          />

          {rows.length === 0 && <ViewEmpty>This index publishes no weights yet.</ViewEmpty>}

          {rows.length > 0 && (
            <>
              <Table
                columns={columnsFor(benchmark)}
                rows={rows}
                getRowId={(row) => row.ticker}
                onSelectRow={(row) => {
                  /*
                   * Straight to Drilldown (BU-166).
                   *
                   * This used to set the tab's own subject and let a linked
                   * Drilldown resolve from here. This tab follows Overview
                   * now, so writing a subject would forward to it and turn
                   * the page's index into a ticker — the page has one
                   * subject and this is not it.
                   */
                  openOrRetarget({
                    page,
                    pane,
                    viewKind: 'asset-drilldown',
                    title: 'Drilldown',
                    subject: row.ticker
                  })
                }}
                maxBodyHeight={560}
              />
              <p className="weights-footnote type-11">
                weights in force at {weights.data.rebalance_date.slice(0, 10)}, asked at{' '}
                {weights.data.as_of.slice(0, 10)}
                {drift != null &&
                  ` · largest move ${percent(drift.maximum * 100)} (${drift.worst}) since ${drift.since.slice(0, 10)}`}
                {benchmark !== '' && ` · active is this index minus ${benchmark} at the same date`}{' '}
                · click a row to open Drilldown
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}

/**
 * Join the benchmark's weights onto ours, keeping only OUR constituents.
 *
 * A name the benchmark holds and this index does not is a real underweight,
 * and the Active face is where it belongs — this table answers "what is in
 * the index", and adding rows with no index weight would answer a different
 * question in the same shape.
 */
function withBenchmark(
  rows: readonly WeightRow[],
  benchmark: Record<string, number> | undefined
): DetailRow[] {
  return rows.map((row) => {
    if (benchmark === undefined) return { ...row, benchmark: undefined, active: undefined }

    const theirs = benchmark[row.ticker]
    return {
      ...row,
      benchmark: theirs,
      // Not held by the benchmark is an overweight of the whole position,
      // which is a number rather than a blank.
      active: row.weight - (theirs ?? 0)
    }
  })
}

function columnsFor(benchmark: string): Column<DetailRow>[] {
  const columns: Column<DetailRow>[] = [
    { key: 'rank', header: '#', width: 36, align: 'right', render: (row) => String(row.rank) },
    { key: 'ticker', header: 'Ticker', width: 90, emphasis: true, render: (row) => row.ticker },
    {
      key: 'weight',
      header: 'Index w',
      width: 90,
      align: 'right',
      render: (row) => `${(row.weight * 100).toFixed(2)}%`
    }
  ]

  // Only with something to compare against: two empty columns would read as
  // a benchmark that holds nothing rather than one nobody named.
  if (benchmark !== '') {
    columns.push(
      {
        key: 'benchmark',
        header: `${benchmark} w`,
        width: 100,
        align: 'right',
        render: (row) =>
          row.benchmark === undefined ? '—' : `${(row.benchmark * 100).toFixed(2)}%`
      },
      {
        key: 'active',
        header: 'Active',
        width: 90,
        align: 'right',
        render: (row) => (row.active === undefined ? '—' : <PercentCell value={row.active * 100} />)
      }
    )
  }

  columns.push(
    {
      key: 'shares',
      header: 'Shares (000)',
      width: 110,
      align: 'right',
      render: (row) =>
        row.shares === undefined ? '—' : Math.round(row.shares / 1000).toLocaleString('en-US')
    },
    {
      key: 'delta',
      header: 'Δ since rebal',
      width: 105,
      align: 'right',
      render: (row) => (row.delta === undefined ? '—' : <DeltaCell value={row.delta * 100} />)
    },
    {
      key: 'risk',
      header: 'Risk contrib',
      width: 100,
      align: 'right',
      render: (row) =>
        row.riskContribution === undefined ? '—' : percent(row.riskContribution * 100)
    },
    {
      key: 'capped',
      header: 'Capped',
      width: 80,
      render: (row) => (row.capped ? <span className="weights-capped">at cap</span> : '—')
    }
  )

  return columns
}
