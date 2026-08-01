import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { WeightBar } from '../../components/WeightBar/WeightBar'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useAttribution } from '../shared/beaconQueries'
import { fromFraction, percent, signedPercent, tone } from '../shared/indexMetrics'
import {
  attributionRows,
  residualPercent,
  warnIfUnreconciled,
  type AttributionRow
} from './attribution'
import './AttributionView.css'

const COLUMNS: readonly Column<AttributionRow>[] = [
  { key: 'ticker', header: 'Ticker', width: 90, emphasis: true, render: (row) => row.ticker },
  {
    key: 'weight',
    header: 'Avg weight',
    width: 100,
    align: 'right',
    render: (row) => percent(row.averageWeight * 100)
  },
  {
    key: 'return',
    header: 'Asset return',
    width: 110,
    align: 'right',
    render: (row) => (
      <span className={`tone-${tone(row.assetReturn)}`}>
        {signedPercent(row.assetReturn * 100)}
      </span>
    )
  },
  {
    key: 'contribution',
    header: 'Contribution',
    width: 110,
    align: 'right',
    render: (row) => (
      <span className={`tone-${tone(row.contribution)}`}>
        {signedPercent(row.contribution * 100, 2)}
      </span>
    )
  },
  {
    key: 'share',
    header: '% of total',
    width: 90,
    align: 'right',
    render: (row) => percent(row.shareOfTotal)
  },
  {
    key: 'bar',
    header: '',
    width: 180,
    render: (row) => (
      <WeightBar
        share={row.magnitude}
        tone={row.contribution >= 0 ? 'default' : 'negative'}
        label={`${row.ticker} ${signedPercent(row.contribution * 100, 2)}`}
      />
    )
  }
]

/**
 * Beacon View → Attribution. Figma 234:8572.
 *
 * The pane REFUSES non-reconciling data (BU-29). An attribution whose parts
 * do not sum to the whole is not slightly wrong — it is a different
 * decomposition from the one the total claims — so rendering it would invite
 * someone to quote a contribution that does not belong to that return.
 */
export function AttributionView({ tab, subject }: ViewProps): ReactElement {
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const attribution = useAttribution(indexId, start, end)

  const view = attribution.data
  const rows = useMemo(() => (view === undefined ? [] : attributionRows(view)), [view])

  useEffect(() => {
    if (view === undefined) return
    warnIfUnreconciled(view, import.meta.env.DEV)
  }, [view])

  return (
    <div className="attribution-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Field label="From" width={130}>
          <input
            className="attribution-input"
            type="date"
            aria-label="From"
            value={start}
            onChange={(event) => {
              setStart(event.target.value)
            }}
          />
        </Field>
        <Field label="To" width={130}>
          <input
            className="attribution-input"
            type="date"
            aria-label="To"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value)
            }}
          />
        </Field>
        <Field label="Method" width={170} value="Contribution to return" />
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Pin this pane to an index.</ViewEmpty>}
      {attribution.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {attribution.isError && <ViewError error={attribution.error} />}

      {view !== undefined && (
        <SummaryLine
          items={[
            {
              label: 'total return',
              value: signedPercent(view.total_return * 100),
              tone: tone(view.total_return)
            },
            { label: 'periods', value: String(view.periods) },
            {
              label: 'cap drag',
              value:
                view.cap_drag == null ? 'uncapped' : signedPercent(fromFraction(view.cap_drag), 2)
            },
            {
              label: 'cost drag',
              value:
                view.cost_drag == null ? 'no costs' : signedPercent(fromFraction(view.cost_drag), 2)
            },
            { label: 'residual', value: `${residualPercent(view).toFixed(4)}%` }
          ]}
        />
      )}

      {view !== undefined && !view.reconciles && (
        <div className="attribution-refusal">
          <p className="type-13">This attribution does not reconcile.</p>
          <p className="type-11">
            The contributions leave a residual of {residualPercent(view).toFixed(4)}% against a
            total return of {(view.total_return * 100).toFixed(4)}%. The table is withheld rather
            than shown, because a decomposition that does not sum to its total is a different
            decomposition — quoting a row from it would attribute a return the index did not make.
          </p>
        </div>
      )}

      {view?.reconciles === true && rows.length > 0 && (
        <>
          <Table columns={COLUMNS} rows={rows} getRowId={(row) => row.ticker} maxBodyHeight={560} />
          <p className="attribution-footnote type-11">
            {view.start.slice(0, 10)} → {view.end.slice(0, 10)} · contributions sum to the index
            return
          </p>
        </>
      )}

      {view?.reconciles === true && rows.length === 0 && (
        <ViewEmpty>No contributions in this period.</ViewEmpty>
      )}
    </div>
  )
}
