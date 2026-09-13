import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useIndex, usePreviewIndex } from '../shared/strategyQueries'
import { TABLE_REFERENCE_FIELDS, useReferenceRows } from '../shared/queries'
import { pipelineOf } from '../index-definition/pipeline'
import { billions } from '../universe/universe'
import {
  CELL_GLYPH,
  cellState,
  looksEquallyWeighted,
  oneWayTurnover,
  percent,
  solveOf,
  solveRows,
  sortAssets,
  summarise,
  summariseSolve,
  waterfallColumns,
  type PreviewAsset,
  type PreviewResponse
} from './derivation'
import { SolveConstraints } from './Solve'
import { solveColumns } from './solveColumns'
import './ConstituentPreviewView.css'

/**
 * Market caps, for an index weighted by them (BU-186).
 *
 * Both, always, when either is shown. `use_free_float` decides which one
 * the weights came FROM, and seeing only that one leaves a reader unable
 * to tell a small company from a closely held one — which is the whole
 * distinction the parameter exists to make.
 *
 * Derived market fields rather than stored reference ones: py-beacon
 * computes a cap as price × shares × fx at request time, which is why they
 * have to be asked for by name. That is also the same arithmetic
 * `MarketCapWeighted` does, so a dash in this column and an equal-weighted
 * index are the same missing datum seen twice.
 */
function capColumns(
  caps: ReadonlyMap<string, Record<string, unknown>>,
  useFreeFloat: boolean
): Column<PreviewAsset>[] {
  const read = (identifier: string, field: string): number | undefined => {
    const value = caps.get(identifier)?.[field]
    return typeof value === 'number' ? value : undefined
  }

  return [
    {
      key: 'market_cap',
      header: 'Mkt cap (bn)',
      width: 110,
      align: 'right',
      emphasis: !useFreeFloat,
      render: (asset) => billions(read(asset.identifier, 'market_cap'))
    },
    {
      key: 'free_float_market_cap',
      header: 'FF mkt cap (bn)',
      width: 120,
      align: 'right',
      emphasis: useFreeFloat,
      render: (asset) => billions(read(asset.identifier, 'free_float_market_cap'))
    }
  ]
}

function buildColumns(
  preview: PreviewResponse,
  caps: ReadonlyMap<string, Record<string, unknown>>,
  weighting: { scheme: string; useFreeFloat: boolean } | undefined
): Column<PreviewAsset>[] {
  const columns: Column<PreviewAsset>[] = [
    {
      key: 'ticker',
      header: 'Ticker',
      width: 80,
      emphasis: true,
      render: (asset) => asset.identifier
    }
  ]

  // Null on a derived index, which has no rules to walk (BN-170). The
  // waterfall is then empty rather than absent; the solve face is BU-173.
  for (const column of waterfallColumns(preview.steps ?? [])) {
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

  // Only where the weights are made of them, so every other index keeps a
  // table narrow enough to read.
  if (weighting?.scheme === 'MarketCapWeighted') {
    columns.push(...capColumns(caps, weighting.useFreeFloat))
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
  const document = useIndex(indexId)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  /*
   * The weighting decides whether caps are worth a column at all.
   *
   * Read from the SAVED document, which is what a preview describes — the
   * pane's own footnote has said so since it was written.
   */
  const scheme = document.data === undefined ? undefined : pipelineOf(document.data)?.weighting
  const weighting = useMemo(
    () =>
      scheme === undefined
        ? undefined
        : { scheme: scheme.scheme, useFreeFloat: scheme.params?.use_free_float === true },
    [scheme]
  )
  const wantsCaps = weighting?.scheme === 'MarketCapWeighted'

  const names = useMemo(
    () => (wantsCaps ? (preview.data?.assets ?? []).map((asset) => asset.identifier) : []),
    [wantsCaps, preview.data]
  )
  const caps = useReferenceRows(names, TABLE_REFERENCE_FIELDS, asOf)

  /*
   * Nothing runs until asked (BU-186).
   *
   * This used to fire on open and again on every keystroke in the date
   * field, so opening the pane resolved the whole pipeline against a date
   * nobody had chosen — and then resolved it again, repeatedly, while one
   * was being typed. A preview is a job, not a page load.
   */
  const { mutate, reset } = preview
  const run = (): void => {
    if (indexId === '' || asOf === '') return
    mutate({ indexId, asOf })
  }

  // A result belongs to the index it was asked for, so switching subject
  // clears it rather than leaving another index's constituents on screen.
  useEffect(() => {
    reset()
  }, [indexId, reset])

  // Which face this preview is: a pipeline answers with the waterfall, a
  // derivation with the solve (BN-170). The discriminator is the response's,
  // not the pane's — the same index can be either between two saves.
  const solve = preview.data === undefined ? undefined : solveOf(preview.data)

  const rows = useMemo(() => {
    if (preview.data === undefined) return []
    return solve === undefined ? sortAssets(preview.data.assets) : solveRows(preview.data.assets)
  }, [preview.data, solve])
  const columns = useMemo(() => {
    if (preview.data === undefined) return []
    if (solve !== undefined) return solveColumns()
    return buildColumns(preview.data, caps.byIdentifier, weighting)
  }, [preview.data, solve, caps.byIdentifier, weighting])

  const summary =
    preview.data === undefined || solve !== undefined ? undefined : summarise(preview.data)
  const solved =
    preview.data === undefined || solve === undefined
      ? undefined
      : summariseSolve(preview.data, solve)
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
            <Button
              variant="accent"
              disabled={indexId === '' || asOf === '' || preview.isPending}
              onClick={run}
            >
              {preview.isPending ? 'Resolving…' : 'Run preview'}
            </Button>
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
        {/*
          Turnover between two dates, which is a question about a schedule.
          A solve reports its distance from the parent instead, so the field
          would drive a figure this face does not show — and a control that
          does nothing is worse than an absent one.
        */}
        {solve === undefined && (
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
        )}
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Open this from an index definition to preview it.</ViewEmpty>}

      {/* Waiting to be asked, which is a different state from having no
          answer: the pane is ready and the reader has not chosen a date. */}
      {indexId !== '' && preview.data === undefined && !preview.isPending && !preview.isError && (
        <ViewEmpty>
          {asOf === ''
            ? 'Choose a date to resolve this index at, then run the preview.'
            : `Run the preview to resolve ${indexId} at ${asOf}.`}
        </ViewEmpty>
      )}

      {preview.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {preview.isError && <ViewError error={preview.error} />}

      {/*
        The fallback nobody was told about (BU-186).

        py-beacon's `MarketCapWeighted` cannot price a name without
        SHARES_OUTSTANDING in the market frame. With none of them priced the
        total cap is zero, and it assigns EQUAL weights and logs a warning
        server-side — so the app draws a perfectly plausible equally
        weighted index under a heading that says market-cap weighted, and
        nothing anywhere says otherwise.

        Detected rather than reported, because there is nothing in the
        response to report it with. Filed against py-beacon as their #191.
      */}
      {wantsCaps && preview.data !== undefined && looksEquallyWeighted(preview.data.assets) && (
        <p className="preview-warning type-11">
          Every weight here is identical, on an index weighted by market capitalisation. py-beacon
          falls back to equal weights when it can price nothing — check the market-cap columns
          below: if they are empty, this store has no SHARES_OUTSTANDING and the weighting never
          ran.
        </p>
      )}

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

      {/*
        A different set of figures, because a solve answers different
        questions: cap and redistribution are a weighting scheme's, and are
        null and zero on every derived preview. What moved, and what it ran
        into, are this face's headline.
      */}
      {solved !== undefined && solve !== undefined && (
        <SummaryLine
          items={[
            { label: `${String(solved.constituents)} constituents`, value: indexId },
            { label: 'Σ weights', value: percent(solved.totalWeight) },
            { label: 'objective', value: solve.objective },
            {
              label: 'binding',
              value: `${String(solved.binding)} of ${String(solved.constraints)}`
            },
            { label: 'moved from parent', value: percent(solved.turnover) }
          ]}
        />
      )}

      {solve !== undefined && <SolveConstraints solve={solve} />}

      {preview.data !== undefined && rows.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={rows}
            getRowId={(asset) => asset.identifier}
            maxBodyHeight={560}
          />
          {solve === undefined ? (
            <p className="preview-footnote type-11">
              {rows.length.toLocaleString('en-US')} names evaluated · resolved{' '}
              {preview.data.as_of.slice(0, 10)} · ✓ passed · ✕ excluded here · · already out ·
              preview describes the SAVED definition
            </p>
          ) : (
            <p className="preview-footnote type-11">
              {rows.length.toLocaleString('en-US')} names · solved from {solve.source_index_id} at
              its {solve.rebalance_date} rebalance · asked for {preview.data.as_of.slice(0, 10)} ·
              preview describes the SAVED definition
            </p>
          )}
        </>
      )}
    </div>
  )
}
