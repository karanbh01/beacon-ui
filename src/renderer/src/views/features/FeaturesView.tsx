import { useMemo, type ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { MenuButton } from '../../components/MenuButton/MenuButton'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { useExport } from '../../export/useExport'
import type { Sheet } from '../../export/sheet'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useFeatureCatalogue, useFeatures } from '../shared/queries'
import {
  datasetsOf,
  featureRows,
  featureValue,
  fieldLabel,
  rowsOfDataset,
  type FeatureRow
} from './features'
import './FeaturesView.css'

const COLUMNS: readonly Column<FeatureRow>[] = [
  {
    key: 'field',
    header: 'Field',
    width: 170,
    emphasis: true,
    render: (row) => fieldLabel(row.field)
  },
  {
    key: 'value',
    header: 'Value',
    width: 120,
    align: 'right',
    render: (row) => featureValue(row.value)
  },
  { key: 'date', header: 'As at', width: 100, render: (row) => row.date ?? '—' },
  { key: 'detail', header: 'Detail', width: 280, render: (row) => row.detail ?? '—' }
]

/**
 * Data Explorer → Features. Every feature the engine holds for one name.
 *
 * A row per FIELD rather than a column per field: the endpoint answers with
 * one value per field for one instrument, and each carries its own as-at date
 * and provenance — "period ending 2026-06-30, reported 2026Q2". A column-per
 * -field table would have nowhere to put either, and provenance is most of
 * what makes a fundamental worth reading.
 *
 * Grouped by dataset, from the catalogue rather than from what came back: a
 * name with no alternative data still has an Alternative card, saying the
 * engine holds none. That is an answer; an absent card looks like the dataset
 * does not exist.
 */
export function FeaturesView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const setSubject = useWorkspace((state) => state.setSubject)
  const exporter = useExport()

  const catalogue = useFeatureCatalogue()
  const features = useFeatures(identifier)

  const rows = useMemo(() => featureRows(features.data), [features.data])
  const datasets = useMemo(() => datasetsOf(catalogue.data), [catalogue.data])

  // Anything the engine sent whose dataset the catalogue does not declare —
  // and anything it holds no value for, which comes back with a null type.
  const ungrouped = rows.filter((row) => row.dataset === undefined)

  const sheet = (): Sheet => ({
    name: `Features ${identifier}`,
    columns: ['Field', 'Value', 'Dataset', 'As at', 'Detail'],
    rows: rows.map((row) => [
      row.field,
      row.value,
      row.dataset ?? null,
      row.date ?? null,
      row.detail ?? null
    ])
  })

  return (
    <div className="features-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(features.data === undefined ? {} : { meta: `as of ${features.data.as_of}` })}
        onQuery={(next) => {
          setSubject(tab.id, next)
        }}
        controls={
          <MenuButton
            label="Export"
            disabled={rows.length === 0 || exporter.busy}
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

      {identifier === '' && <ViewEmpty>Name an instrument to see its features.</ViewEmpty>}

      {identifier !== '' && (catalogue.isPending || features.isPending) && (
        <ViewLoading what="features" />
      )}
      {catalogue.isError && <ViewError error={catalogue.error} />}
      {features.isError && <ViewError error={features.error} />}

      {/*
        An engine whose store predates BN-140 answers `{"types": [], "fields":
        []}` rather than erroring, which reads as a client fault. Say what it
        actually is.
      */}
      {catalogue.isSuccess && datasets.length === 0 && (
        <ViewEmpty>
          This engine holds no feature datasets. A store generated before they existed has none —
          Data Coverage can replace it.
        </ViewEmpty>
      )}

      {features.isSuccess &&
        datasets.map((dataset) => {
          const held = rowsOfDataset(rows, dataset)
          return (
            <Card key={dataset} title={fieldLabel(dataset)} className="features-card">
              {held.length === 0 ? (
                <p className="features-none type-11">
                  The engine holds no {dataset} data for {identifier}.
                </p>
              ) : (
                <Table columns={COLUMNS} rows={held} getRowId={(row) => row.field} />
              )}
            </Card>
          )
        })}

      {features.isSuccess && ungrouped.length > 0 && (
        <p className="features-footnote type-11">
          {ungrouped.length} field{ungrouped.length === 1 ? '' : 's'} with no value for {identifier}
          : {ungrouped.map((row) => fieldLabel(row.field)).join(', ')}
        </p>
      )}
    </div>
  )
}
