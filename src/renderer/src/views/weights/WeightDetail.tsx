import { useMemo, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { isAbsent, useHoldings, useRunResult, useWeights } from '../shared/beaconQueries'
import { percent } from '../shared/indexMetrics'
import { useReferenceColumns } from '../shared/holdingColumns'
import { HoldingColumnsButton } from '../shared/HoldingColumnsButton'
import { holdingsColumns, holdingsOrder } from './holdingsColumns'

export interface WeightDetailProps {
  strategyId: string
  page: string
  pane: number | undefined
  asof: string
  onAsof: (asof: string) => void
  /** Whether the reader has run it: until then the face is empty. */
  ran: boolean
  onRun: () => void
}

/** This table's own column choice, under Asset → Holding columns. */
const TABLE = 'holdings-detail'

/**
 * Holdings → Holdings Detail (Karan, 2026-10-19; py-beacon 0.9.3, BN-326).
 *
 * The strategy's whole workflow at one date, a row per universe name: the
 * index's rules and cap, the benchmark's weight, the strategy's, the
 * implementation's screens and caps, what the rebalance traded to and, on a
 * day between rebalances, how far it has drifted since. Names that dropped
 * out stay in the table under the ones held, marked where they left, as the
 * constituent preview marks them.
 *
 * The concentration line still reads `/weights`, which is where the engine
 * works those figures out.
 */
export function WeightDetail({
  strategyId,
  page,
  pane,
  asof,
  onAsof,
  ran,
  onRun
}: WeightDetailProps): ReactElement {
  const reference = useReferenceColumns(TABLE)
  const holdings = useHoldings(strategyId, asof, reference.fields, ran)
  const weights = useWeights(ran ? strategyId : '', asof)
  // The run's rebalances to pick from before the first run, from the run
  // itself, which Overview has usually read already.
  const run = useRunResult(ran ? '' : strategyId)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const view = holdings.data
  const rows = useMemo(
    () => (view === undefined ? [] : holdingsOrder(view.rows, view.stages)),
    [view]
  )
  const columns = useMemo(
    () =>
      view === undefined
        ? []
        : holdingsColumns({
            stages: view.stages,
            rows: view.rows,
            reference: reference.columns,
            between: view.as_of.slice(0, 10) !== view.rebalance_date.slice(0, 10)
          }),
    [view, reference.columns]
  )
  // The run's rebalances, newest first, to pick from rather than type.
  const rebalances = useMemo(
    () =>
      [
        ...new Set(
          (view?.rebalance_dates ?? (run.data?.rebalances ?? []).map((each) => each.date)).map(
            (date) => date.slice(0, 10)
          )
        )
      ]
        .sort()
        .reverse()
        .map((date) => ({ value: date, label: date })),
    [view, run.data]
  )

  const held = rows.filter((row) => row.excluded_at == null).length
  const universe = view?.stages.find((stage) => stage.kind === 'universe')?.remaining
  const concentration = weights.data?.concentration

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
        <Field label="Rebalance" width={150}>
          <Select
            options={rebalances}
            value={view?.rebalance_date.slice(0, 10) ?? ''}
            onChange={onAsof}
            label="Rebalance"
            placeholder="No rebalances"
          />
        </Field>
        {!ran && (
          <Button variant="accent" onClick={onRun} disabled={strategyId === ''}>
            Run
          </Button>
        )}
      </div>

      {!ran && (
        <ViewEmpty figure="calendar">
          {asof === ''
            ? "Choose a date or a rebalance, then run to see the strategy's holdings on that day. Leave the date empty for the latest."
            : `Run to see the strategy's holdings on ${asof}.`}
        </ViewEmpty>
      )}

      {holdings.isPending && <ViewLoading what={strategyId} />}
      {holdings.isError &&
        (isAbsent(holdings.error) ? (
          <ViewEmpty figure="calendar">
            No holdings on that date. Pick a rebalance, or a later day.
          </ViewEmpty>
        ) : (
          <ViewError error={holdings.error} />
        ))}

      {view !== undefined && (
        <>
          <SummaryLine
            items={[
              ...(universe === undefined
                ? []
                : [{ label: 'in the universe', value: String(universe) }]),
              { label: 'held', value: String(held) },
              {
                label: 'cash',
                value: view.cash_weight == null ? '—' : percent(view.cash_weight * 100, 2)
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
              { label: 'effective N', value: concentration?.effective_assets.toFixed(1) ?? '—' }
            ]}
          />

          {rows.length === 0 && (
            <ViewEmpty figure="cardindex">This strategy holds nothing on that date.</ViewEmpty>
          )}

          {rows.length > 0 && (
            <>
              <Table
                columns={columns}
                headerAction={<HoldingColumnsButton table={TABLE} />}
                rows={rows}
                // Fits the pane: columns narrow to their floors, then the
                // table scrolls sideways under a head that follows.
                fillWidth
                queryable
                getRowId={(row) => row.identifier}
                onSelectRow={(row) => {
                  /*
                   * Straight to Drilldown (BU-166). This tab follows
                   * Overview, so writing a subject here would forward to it
                   * and turn the page's strategy into a ticker.
                   */
                  openOrRetarget({
                    page,
                    pane,
                    viewKind: 'asset-drilldown',
                    title: 'Drilldown',
                    subject: row.identifier
                  })
                }}
                maxBodyHeight={560}
              />
              {/* The rebalance date is in the field above; this says which day the table is. */}
              <p className="weights-footnote type-11">
                weights as of {view.as_of.slice(0, 10)} · click a row to open Drilldown
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}
