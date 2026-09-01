import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { MenuButton } from '../../components/MenuButton/MenuButton'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { TableFrame } from '../../api/frame'
import type { ViewProps } from '../../shell/viewRegistry'
import { useExport } from '../../export/useExport'
import type { Sheet } from '../../export/sheet'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useTablePage } from '../shared/queries'
import {
  DATASETS,
  applyFilters,
  fromFrame,
  isNumericColumn,
  withoutHidden,
  type DatasetId,
  type RawRow
} from './database'
import './DatabaseView.css'

/** The engine caps a page at 1,000 rows, which is also plenty to scroll. */
const PAGE = 1_000

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
 * **The whole table, not one instrument (BU-138).** It used to require an
 * identifier, because when it was written the per-identifier endpoints were
 * the only way in. BN-147 added the paged table endpoint and BN-150 its
 * `identifiers` filter, so the name is one filter among several now and the
 * view opens with data in it.
 */
export function DatabaseView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const [dataset, setDataset] = useState<DatasetId>('market')
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const setSubject = useWorkspace((state) => state.setSubject)
  const exporter = useExport()

  const page = useTablePage(dataset, {
    identifiers: identifier === '' ? [] : [identifier],
    offset,
    limit: PAGE
  })

  const table = useMemo(
    // RATE is the FX dataset's column; on a market bar it says nothing
    // (BU-139).
    /*
     * `rows` is typed as a bare object on the wire — the schema documents it
     * as "the {index, columns, data} frame shape used elsewhere" without
     * saying so in types, which is the same cast the Features view makes.
     */
    () => withoutHidden(dataset, fromFrame(page.data?.rows as TableFrame | undefined, 'Index')),
    [dataset, page.data]
  )

  /*
   * Filtering happens HERE, on the page (BU-138).
   *
   * The endpoint takes offset, limit and identifiers and nothing else — its
   * own documentation says a client wanting predicates wants a query
   * language and that this is the wrong place to grow one. So the column
   * boxes narrow what has been fetched, and the footnote says as much rather
   * than implying the whole table was searched.
   */
  const shown = useMemo(() => applyFilters(table, filters), [table, filters])

  const columns = useMemo(
    (): Column<RawRow>[] =>
      table.columns.map((header, index) => ({
        key: header,
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
  const total = page.data?.total ?? 0
  const filtering = Object.values(filters).some((expression) => expression.trim() !== '')

  const sheet = (): Sheet => ({
    name: `${dataset}${identifier === '' ? '' : ` ${identifier}`}`,
    columns: shown.columns,
    rows: shown.rows.map((row) => row.cells)
  })

  const move = (by: number): void => {
    setOffset((current) => Math.max(0, Math.min(current + by, Math.max(total - PAGE, 0))))
  }

  return (
    <div className="database-view">
      <PaneHeader
        kind="fields"
        controls={
          <MenuButton
            label="Export"
            disabled={shown.rows.length === 0 || exporter.busy}
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
        <Select
          label="Dataset"
          value={dataset}
          options={DATASETS.map((entry) => ({ value: entry.id, label: entry.label }))}
          onChange={(value) => {
            setDataset(value as DatasetId)
            // A filter names a column, and the columns change with the
            // dataset — carrying them over would hide rows for a reason
            // nothing on screen still explains.
            setFilters({})
            setOffset(0)
          }}
        />
        <Field label="Identifier" width={150}>
          <input
            className="database-input"
            value={identifier}
            aria-label="Identifier"
            placeholder="all"
            spellCheck={false}
            onChange={(event) => {
              setSubject(tab.id, event.target.value.toUpperCase())
              setOffset(0)
            }}
          />
        </Field>
      </PaneHeader>

      {page.isPending && <ViewLoading what={dataset} />}
      {page.isError && <ViewError error={page.error} />}

      {page.isSuccess && table.rows.length === 0 && (
        <ViewEmpty>
          The {dataset} dataset holds nothing{identifier === '' ? '' : ` for ${identifier}`}.
        </ViewEmpty>
      )}

      {table.rows.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={shown.rows}
            getRowId={(row) => row.key}
            filters={filters}
            onFilter={(key, value) => {
              setFilters((current) => ({ ...current, [key]: value }))
            }}
            fillHeight
            fillWidth
          />

          <div className="database-paging">
            <Button
              disabled={offset === 0 || page.isFetching}
              onClick={() => {
                move(-PAGE)
              }}
            >
              Previous
            </Button>
            <Button
              disabled={offset + PAGE >= total || page.isFetching}
              onClick={() => {
                move(PAGE)
              }}
            >
              Next
            </Button>

            {/*
              What is on screen against what exists (BU-138). A page out of a
              million rows that says only "1,000 rows" reads as the whole
              table, which is the one thing this view must never do.
            */}
            <p className="database-footnote type-11">
              {shown.rows.length.toLocaleString('en-US')}
              {filtering && ` of ${table.rows.length.toLocaleString('en-US')}`}{' '}
              {spec?.unit ?? 'rows'}
              {filtering && ' on this page'} · showing {(offset + 1).toLocaleString('en-US')}–
              {Math.min(offset + table.rows.length, total).toLocaleString('en-US')} of{' '}
              {total.toLocaleString('en-US')} · {table.columns.length} columns, exactly as py-beacon
              sent them
            </p>
          </div>
        </>
      )}
    </div>
  )
}
