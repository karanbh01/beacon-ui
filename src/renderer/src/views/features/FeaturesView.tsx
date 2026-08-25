import { useMemo, useState, type ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { MenuButton } from '../../components/MenuButton/MenuButton'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { useExport } from '../../export/useExport'
import type { Sheet } from '../../export/sheet'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useTable } from '../shared/queries'
import { RANGES, rangeStart, type Range } from '../prices/usePrices'
import {
  featureValue,
  fieldLabel,
  fieldsIn,
  historyRows,
  within,
  type FeatureHistoryRow
} from './features'
import './FeaturesView.css'

const COLUMNS: readonly Column<FeatureHistoryRow>[] = [
  { key: 'date', header: 'Date', width: 110, emphasis: true, render: (row) => row.date },
  { key: 'field', header: 'Field', width: 170, render: (row) => fieldLabel(row.field) },
  {
    key: 'value',
    header: 'Value',
    width: 120,
    align: 'right',
    render: (row) => featureValue(row.value)
  },
  { key: 'dataset', header: 'Dataset', width: 120, render: (row) => fieldLabel(row.dataset) },
  { key: 'detail', header: 'Detail', width: 300, render: (row) => row.detail ?? '—' }
]

/**
 * Data Explorer → Features. Every value the engine holds, over time.
 *
 * A series, like Prices and Corporate Actions — not a snapshot. It began as
 * one value per field from `/data/features/{identifier}`, which is all that
 * endpoint answers; the point-in-time cards that showed have gone, because
 * the newest rows of the series say the same thing without a second shape to
 * read.
 *
 * The rows come from `/data/tables/features`, which holds every value ever
 * published. Its `identifiers` filter (BN-147) is what makes that reachable
 * per instrument at all — without it, one name's rows meant paging a million.
 *
 * Dates are applied HERE rather than in the request: that endpoint takes only
 * offset, limit and identifiers, and one instrument's history is a few hundred
 * rows, so one fetch serves every range the user tries.
 */
export function FeaturesView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const [range, setRange] = useState<Range>('1Y')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [field, setField] = useState('')

  const setSubject = useWorkspace((state) => state.setSubject)
  const exporter = useExport()
  const table = useTable('features', identifier)

  const rows = useMemo(() => historyRows(table.data), [table.data])
  const fields = useMemo(() => fieldsIn(rows), [rows])

  /*
   * A typed date beats the range buttons.
   *
   * They answer the same question, so one has to win, and it should be the
   * one that took more effort to say.
   */
  const from = start !== '' ? start : (rangeStart(range) ?? '')
  const shown = useMemo(
    () => within(rows, from, end).filter((row) => field === '' || row.field === field),
    [rows, from, end, field]
  )

  const sheet = (): Sheet => ({
    name: `Features ${identifier}`,
    columns: ['Date', 'Field', 'Value', 'Dataset', 'Detail'],
    rows: shown.map((row) => [row.date, row.field, row.value, row.dataset, row.detail ?? null])
  })

  return (
    <div className="features-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        onQuery={(next) => {
          setSubject(tab.id, next)
        }}
        controls={
          <MenuButton
            label="Export"
            disabled={shown.length === 0 || exporter.busy}
            choices={[
              { value: 'csv', label: 'CSV' },
              { value: 'xlsx', label: 'Excel' }
            ]}
            onChoose={(format) => {
              void exporter.save(sheet(), format === 'xlsx' ? 'xlsx' : 'csv')
            }}
          />
        }
      />

      <div className="features-controls">
        <SegmentedControl segments={RANGES} value={range} onChange={setRange} label="Range" />

        <Field label="From" width={130}>
          <input
            className="features-input"
            type="date"
            aria-label="From"
            value={from}
            onChange={(event) => {
              setStart(event.target.value)
            }}
          />
        </Field>
        <Field label="To" width={130}>
          <input
            className="features-input"
            type="date"
            aria-label="To"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value)
            }}
          />
        </Field>

        {fields.length > 1 && (
          <Select
            label="Field"
            value={field}
            options={[
              { value: '', label: 'All fields' },
              ...fields.map((name) => ({ value: name, label: fieldLabel(name) }))
            ]}
            onChange={setField}
          />
        )}
      </div>

      {identifier === '' && <ViewEmpty>Name an instrument to see its features.</ViewEmpty>}

      {identifier !== '' && table.isPending && <ViewLoading what="features" />}
      {table.isError && <ViewError error={table.error} />}

      {/*
        An engine whose store predates BN-140 holds no features at all and
        answers emptily rather than erroring, which reads as a client fault.
      */}
      {table.isSuccess && rows.length === 0 && (
        <ViewEmpty>
          The engine holds no features for {identifier}. A store generated before they existed has
          none — Data Coverage can replace it.
        </ViewEmpty>
      )}

      {table.isSuccess && rows.length > 0 && shown.length === 0 && (
        <ViewEmpty>No values in this range.</ViewEmpty>
      )}

      {shown.length > 0 && (
        <>
          <Table columns={COLUMNS} rows={shown} getRowId={(row) => row.key} maxBodyHeight={560} />
          <p className="features-footnote type-11">
            {shown.length.toLocaleString('en-US')} value{shown.length === 1 ? '' : 's'}
            {shown.length < rows.length && ` of ${rows.length.toLocaleString('en-US')} held`} ·{' '}
            {shown[shown.length - 1]?.date} → {shown[0]?.date}
          </p>
        </>
      )}
    </div>
  )
}
