import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { usePreviewIndex } from '../shared/strategyQueries'
import {
  CELL_GLYPH,
  cellState,
  oneWayTurnover,
  percent,
  sortAssets,
  summarise,
  waterfallColumns,
  type PreviewAsset,
  type PreviewResponse
} from './derivation'
import './ConstituentPreviewView.css'

function buildColumns(preview: PreviewResponse): Column<PreviewAsset>[] {
  const columns: Column<PreviewAsset>[] = [
    {
      key: 'ticker',
      header: 'Ticker',
      width: 80,
      emphasis: true,
      render: (asset) => asset.identifier
    }
  ]

  for (const column of waterfallColumns(preview.steps)) {
    columns.push({
      key: column.key,
      header: column.header,
      width: 120,
      render: (asset) => {
        const state = cellState(asset, column.position)
        return <span className={`derivation-${state}`}>{CELL_GLYPH[state]}</span>
      }
    })
  }

  columns.push(
    {
      key: 'raw',
      header: 'Raw w',
      width: 90,
      align: 'right',
      render: (asset) => percent(asset.uncapped_weight ?? asset.weight)
    },
    {
      key: 'weight',
      header: 'Final w',
      width: 100,
      align: 'right',
      render: (asset) => (
        <span className={asset.capped ? 'derivation-capped' : undefined}>
          {percent(asset.weight)}
        </span>
      )
    }
  )

  return columns
}

/**
 * Strategy Builder → Constituent Preview. Figma 234:6626.
 *
 * The derivation waterfall: one column per pipeline rule, showing where each
 * name dropped out. Every figure comes from one `POST /indices/{id}/preview`
 * — nothing here is recomputed client-side except turnover, which needs a
 * second preview at another date and is therefore opt-in.
 *
 * Figma's table also carries Name and FF Mkt Cap, which are one reference
 * call per constituent (#45), and its summary line a next-rebalance date,
 * which needs a schedule the document does not model (#44).
 */
export function ConstituentPreviewView({ tab, subject, pane }: ViewProps): ReactElement {
  const indexId = subject ?? ''
  const [asOf, setAsOf] = useState('')
  const [compareTo, setCompareTo] = useState('')

  const preview = usePreviewIndex()
  const comparison = usePreviewIndex()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const { mutate } = preview
  useEffect(() => {
    if (indexId === '') return
    mutate(asOf === '' ? { indexId } : { indexId, asOf })
  }, [indexId, asOf, mutate])

  const rows = useMemo(
    () => (preview.data === undefined ? [] : sortAssets(preview.data.assets)),
    [preview.data]
  )
  const columns = useMemo(
    () => (preview.data === undefined ? [] : buildColumns(preview.data)),
    [preview.data]
  )

  const summary = preview.data === undefined ? undefined : summarise(preview.data)
  const turnover =
    preview.data === undefined || comparison.data === undefined
      ? undefined
      : oneWayTurnover(comparison.data.weights, preview.data.weights)

  return (
    <div className="constituent-preview-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button
              onClick={() => {
                openOrRetarget({
                  page: tab.page,
                  pane,
                  viewKind: 'index-definition',
                  title: indexId,
                  subject: indexId
                })
              }}
            >
              Open definition
            </Button>
            <Button chevron>Export</Button>
          </>
        }
      >
        <Field label="As of" width={130}>
          <input
            className="preview-input"
            type="date"
            aria-label="As of"
            value={asOf}
            onChange={(event) => {
              setAsOf(event.target.value)
            }}
          />
        </Field>
        <Field label="Compare vs" width={130}>
          <input
            className="preview-input"
            type="date"
            aria-label="Compare vs"
            value={compareTo}
            onChange={(event) => {
              const next = event.target.value
              setCompareTo(next)
              if (next !== '' && indexId !== '') comparison.mutate({ indexId, asOf: next })
            }}
          />
        </Field>
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Open this from an index definition to preview it.</ViewEmpty>}
      {preview.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {preview.isError && <ViewError error={preview.error} />}

      {summary !== undefined && preview.data !== undefined && (
        <SummaryLine
          items={[
            { label: `${String(summary.constituents)} constituents`, value: indexId },
            { label: 'Σ weights', value: percent(summary.totalWeight) },
            {
              label: 'capped',
              value:
                summary.cap === null
                  ? 'uncapped'
                  : `${String(summary.capped)} at ${percent(summary.cap, 1)}`
            },
            { label: 'redistributed', value: percent(summary.redistributed) },
            {
              label: 'one-way turnover',
              value: turnover === undefined ? 'pick a date' : percent(turnover)
            }
          ]}
        />
      )}

      {preview.data !== undefined && rows.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={rows}
            getRowId={(asset) => asset.identifier}
            maxBodyHeight={560}
          />
          <p className="preview-footnote type-11">
            {rows.length.toLocaleString('en-US')} names evaluated · resolved{' '}
            {preview.data.as_of.slice(0, 10)} · ✓ passed · ✕ excluded here · · already out · preview
            describes the SAVED definition
          </p>
        </>
      )}
    </div>
  )
}
