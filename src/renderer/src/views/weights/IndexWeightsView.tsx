import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { WeightBar } from '../../components/WeightBar/WeightBar'
import { DeltaCell } from '../../components/Table/cells'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useWeights } from '../shared/beaconQueries'
import { constituentRows, percent, weightRows, type WeightRow } from '../shared/indexMetrics'
import './IndexWeightsView.css'

const COLUMNS: readonly Column<WeightRow>[] = [
  {
    key: 'rank',
    header: '#',
    width: 36,
    align: 'right',
    render: (row) => String(row.rank)
  },
  { key: 'ticker', header: 'Ticker', width: 90, emphasis: true, render: (row) => row.ticker },
  {
    key: 'weight',
    header: 'Weight',
    width: 90,
    align: 'right',
    render: (row) => `${(row.weight * 100).toFixed(2)}%`
  },
  {
    key: 'bar',
    header: '',
    width: 180,
    render: (row) => (
      <WeightBar
        share={row.share}
        tone={row.capped ? 'accent' : 'default'}
        label={`${row.ticker} ${(row.weight * 100).toFixed(2)}%`}
      />
    )
  },
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
]

/**
 * Beacon View → Weights. Figma 234:8155.
 *
 * Shares, Δ since rebal and risk contribution come from `WeightsView.rows`
 * (BN-123) — the per-constituent breakdown this pane had no source for, when
 * `drift` was an aggregate carrying only turnover and the worst mover.
 *
 * Each is rendered only when the engine sent it. A dash means it did not; a
 * zero would be a claim.
 *
 * Name and GICS Sub-Industry still need the batch reference join and land
 * with it.
 */
export function IndexWeightsView({ tab, subject }: ViewProps): ReactElement {
  // The INDEX comes from the pin; `subject` is the selected CONSTITUENT.
  // Two different things, and this is the pane where they meet: Figma links
  // Drilldown to this tab (357:2319), so this tab's subject has to be the
  // name Drilldown drills into, not the index it belongs to.
  const indexId = tab.pinnedDoc ?? ''
  const [asof, setAsof] = useState('')
  const weights = useWeights(indexId, asof)
  const setSubject = useWorkspace((state) => state.setSubject)

  // Prefer the per-constituent rows; fall back to the identifier→fraction map,
  // because a response without `rows` is still a valid one and the table
  // should draw what it can rather than nothing.
  const rows = useMemo(() => {
    const detailed = weights.data?.rows
    if (detailed !== undefined && detailed.length > 0) {
      return constituentRows(detailed)
    }
    return weightRows(weights.data?.weights ?? {}, weights.data?.capped ?? [])
  }, [weights.data])

  const concentration = weights.data?.concentration
  const drift = weights.data?.drift
  const total = rows.reduce((sum, row) => sum + row.weight, 0)

  return (
    <div className="index-weights-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Field label="As of" width={130}>
          <input
            className="weights-input"
            type="date"
            aria-label="As of"
            value={asof}
            onChange={(event) => {
              setAsof(event.target.value)
            }}
          />
        </Field>
        <Field
          label="Rebalance"
          width={160}
          value={weights.data?.rebalance_date.slice(0, 10) ?? '—'}
        />
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Pin this pane to an index.</ViewEmpty>}
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
                value: percent((concentration?.top_weights['5'] ?? 0) * 100)
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
                columns={COLUMNS}
                rows={rows}
                getRowId={(row) => row.ticker}
                selectedId={subject ?? ''}
                onSelectRow={(row) => {
                  // Selecting a name changes THIS tab's subject; the linked
                  // Drilldown resolves from here and follows (taxonomy §1,
                  // archetype 6). Opening a Drilldown directly would break
                  // the link the design draws.
                  setSubject(tab.id, row.ticker)
                }}
                maxBodyHeight={560}
              />
              <p className="weights-footnote type-11">
                weights in force at {weights.data.rebalance_date.slice(0, 10)}, asked at{' '}
                {weights.data.as_of.slice(0, 10)}
                {drift != null &&
                  ` · largest move ${percent(drift.maximum * 100)} (${drift.worst}) since ${drift.since.slice(0, 10)}`}{' '}
                · click a row to open Drilldown
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
