import { useMemo, useState, type ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { MenuButton } from '../../components/MenuButton/MenuButton'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { useExport } from '../../export/useExport'
import type { Sheet } from '../../export/sheet'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useCorporateActions, useFeatures, useReference } from '../shared/queries'
import { usePrices } from '../prices/usePrices'
import {
  DATASETS,
  asPairs,
  fromFrame,
  fromRecords,
  isNumericColumn,
  withoutHidden,
  type DatasetId,
  type RawRow,
  type RawTable
} from './database'
import './DatabaseView.css'

/**
 * Data Explorer → Database. The stored data, before any view shapes it.
 *
 * Every other view answers a question — what is this worth, what is in this
 * universe. This one answers "what does the engine actually hold", which is
 * the question you ask when a view looks wrong and you need to know whether
 * the data or the rendering is at fault.
 *
 * So nothing is renamed, reordered, dropped or rounded, and the columns come
 * from the response rather than from a list here. A column that appears in
 * py-beacon tomorrow appears here tomorrow.
 *
 * **Per identifier, because that is what is addressable.** There is no
 * whole-table endpoint — see `docs/engine-requests/data-gaps.md`, where a
 * paged one is asked for. Market data alone is millions of rows, so an
 * unbounded dump is not something to add without paging.
 */
export function DatabaseView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const [dataset, setDataset] = useState<DatasetId>('market')
  const setSubject = useWorkspace((state) => state.setSubject)
  const exporter = useExport()

  // All four run, so switching dataset is instant on a name already read.
  // They are the same queries the shaped views use, so the cache is shared
  // rather than duplicated.
  const prices = usePrices(identifier, {})
  const reference = useReference(identifier, { noRetry: true })
  const actions = useCorporateActions(identifier)
  const features = useFeatures(identifier)

  const active = {
    market: prices,
    reference,
    corporate_actions: actions,
    features
  }[dataset]

  const table = useMemo((): RawTable => {
    // RATE is the FX dataset's column; on a market bar it says nothing
    // (BU-139).
    if (dataset === 'market') return withoutHidden('market', fromFrame(prices.data?.prices, 'Date'))
    if (dataset === 'reference') return asPairs(reference.data?.fields ?? undefined)
    if (dataset === 'corporate_actions') {
      return fromRecords(actions.data?.actions ?? [])
    }
    return fromRecords(features.data?.features ?? [])
  }, [dataset, prices.data, reference.data, actions.data, features.data])

  const columns = useMemo(
    (): Column<RawRow>[] =>
      table.columns.map((header, index) => ({
        key: `${header}-${String(index)}`,
        header,
        width: index === 0 ? 150 : 130,
        emphasis: index === 0,
        ...(isNumericColumn(table, index) ? { align: 'right' as const } : {}),
        render: (row: RawRow) => {
          const value = row.cells[index]
          // Verbatim: `null` is written as the word, because a dash would be
          // indistinguishable from a string that is genuinely "—".
          if (value === null) return <span className="database-null">null</span>
          return String(value)
        }
      })),
    [table]
  )

  const spec = DATASETS.find((entry) => entry.id === dataset)

  const sheet = (): Sheet => ({
    name: `${dataset} ${identifier}`,
    columns: table.columns,
    rows: table.rows.map((row) => row.cells)
  })

  return (
    <div className="database-view">
      <PaneHeader
        kind="fields"
        controls={
          <MenuButton
            label="Export"
            disabled={table.rows.length === 0 || exporter.busy}
            choices={[
              { value: 'csv', label: 'CSV' },
              { value: 'xlsx', label: 'Excel' }
            ]}
            onChoose={(format) => {
              void exporter.save(sheet(), format === 'xlsx' ? 'xlsx' : 'csv')
            }}
          />
        }
      >
        <Field label="Identifier" width={150}>
          <input
            className="database-input"
            value={identifier}
            aria-label="Identifier"
            spellCheck={false}
            onChange={(event) => {
              setSubject(tab.id, event.target.value.toUpperCase())
            }}
          />
        </Field>
        <Select
          label="Dataset"
          value={dataset}
          options={DATASETS.map((entry) => ({ value: entry.id, label: entry.label }))}
          onChange={(value) => {
            setDataset(value as DatasetId)
          }}
        />
      </PaneHeader>

      {identifier === '' && <ViewEmpty>Name an instrument to read its stored rows.</ViewEmpty>}

      {identifier !== '' && active.isPending && <ViewLoading what={dataset} />}
      {active.isError && <ViewError error={active.error} />}

      {active.isSuccess && table.rows.length === 0 && (
        <ViewEmpty>
          The {dataset} dataset holds nothing for {identifier}.
        </ViewEmpty>
      )}

      {table.rows.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={table.rows}
            getRowId={(row) => row.key}
            maxBodyHeight={560}
          />
          <p className="database-footnote type-11">
            {table.rows.length.toLocaleString('en-US')} {spec?.unit ?? 'rows'} ·{' '}
            {table.columns.length} columns, exactly as py-beacon sent them · one identifier at a
            time, because there is no whole-table endpoint
          </p>
        </>
      )}
    </div>
  )
}
