import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useCorporateActions } from '../shared/queries'
import {
  amountLabel,
  describeAction,
  payDateLabel,
  statusLabel,
  filterByType,
  formatDate,
  nextExDate,
  percent,
  sortNewestFirst,
  typeLabel,
  typesIn,
  type CorporateAction
} from './actions'
import './CorporateActionsView.css'

const ALL = '__all__'

/** Ten years back. Long enough to show a split history without paging. */
function historyStart(now: Date): string {
  const start = new Date(now)
  start.setFullYear(start.getFullYear() - 10)
  return start.toISOString().slice(0, 10)
}

const COLUMNS: readonly Column<CorporateAction>[] = [
  {
    key: 'ex_date',
    header: 'Ex-Date',
    width: 110,
    emphasis: true,
    render: (action) => formatDate(action.ex_date)
  },
  {
    key: 'pay_date',
    header: 'Pay Date',
    width: 110,
    render: payDateLabel
  },
  { key: 'type', header: 'Type', width: 120, render: (action) => typeLabel(action.type) },
  { key: 'details', header: 'Details', width: 240, render: describeAction },
  { key: 'status', header: 'Status', width: 100, render: statusLabel },
  { key: 'amount', header: 'Amount', width: 100, align: 'right', render: amountLabel }
]

/**
 * Data Explorer → Corporate Actions. Figma 234:4958.
 *
 * Pay Date and Status are live since BN-118, along with `kind` — which is
 * what `value` means, stated rather than inferred from the type string.
 *
 * The summary line's payout ratio is still absent: it needs trailing EPS or
 * net income and there is no earnings figure anywhere in the spec. It stays
 * out rather than being rendered as a dash, which would read as "this
 * instrument has no payout ratio" instead of "this engine does not publish
 * one". Tracked on #60 as a py-beacon ask rather than a client gap.
 */
export function CorporateActionsView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const [type, setType] = useState<string>(ALL)
  const setSubject = useWorkspace((state) => state.setSubject)

  const start = useMemo(() => historyStart(new Date()), [])
  const query = useCorporateActions(identifier, { start })

  const actions = useMemo(() => sortNewestFirst(query.data?.actions ?? []), [query.data])
  const segments = useMemo(
    () => [
      { value: ALL, label: 'All types' },
      ...typesIn(actions).map((name) => ({ value: name, label: typeLabel(name) }))
    ],
    [actions]
  )

  const shown = useMemo(
    () => filterByType(actions, type === ALL ? undefined : type),
    [actions, type]
  )
  const upcoming = useMemo(
    () => nextExDate(actions, new Date().toISOString().slice(0, 10)),
    [actions]
  )

  // A type that vanished when the identifier changed must not leave the
  // control pointing at a segment that is no longer there.
  const selected = segments.some((segment) => segment.value === type) ? type : ALL

  return (
    <div className="corporate-actions-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        meta="Corporate actions"
        onQuery={(next) => {
          // The store owns the subject (BU-16).
          setSubject(tab.id, next)
        }}
        controls={<Button chevron>Export</Button>}
      />

      {query.isSuccess && (
        <SummaryLine
          items={[
            { label: 'TTM dividends', value: `${query.data.trailing_dividend.toFixed(2)} / share` },
            { label: 'yield', value: percent(query.data.trailing_dividend_yield) },
            {
              label: 'cumulative split ratio',
              value: `×${query.data.cumulative_split_ratio.toFixed(2)}`
            },
            {
              label: 'next ex-date',
              value: upcoming === undefined ? '—' : formatDate(upcoming.ex_date)
            }
          ]}
        />
      )}

      {segments.length > 1 && (
        <SegmentedControl
          segments={segments}
          value={selected}
          onChange={setType}
          label="Action type"
        />
      )}

      {identifier === '' && (
        <ViewEmpty>Type an identifier to load its corporate actions.</ViewEmpty>
      )}
      {query.isPending && identifier !== '' && <ViewLoading what={identifier} />}
      {query.isError && <ViewError error={query.error} />}

      {query.isSuccess && shown.length === 0 && (
        <ViewEmpty>No corporate actions in the last ten years.</ViewEmpty>
      )}

      {query.isSuccess && shown.length > 0 && (
        <>
          <Table
            columns={COLUMNS}
            rows={shown}
            getRowId={(action) => `${action.ex_date}-${action.type}-${String(action.value)}`}
            maxBodyHeight={520}
          />
          <p className="corporate-actions-footnote type-11">
            {shown.length.toLocaleString('en-US')} action{shown.length === 1 ? '' : 's'}
            {shown.length !== actions.length && ` of ${String(actions.length)}`} · since{' '}
            {formatDate(start)} · cash amounts are per share, in the instrument&rsquo;s own currency
          </p>
        </>
      )}
    </div>
  )
}
