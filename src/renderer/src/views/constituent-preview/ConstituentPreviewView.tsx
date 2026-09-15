import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewWorking } from '../shared/ViewState'
import { useIndex, usePreviewIndex } from '../shared/strategyQueries'
import { TABLE_REFERENCE_FIELDS, useCoverage, useReferenceRows } from '../shared/queries'
import { pipelineOf } from '../index-definition/pipeline'
import {
  CELL_GLYPH,
  cellState,
  explainEqualWeights,
  looksEquallyWeighted,
  marketCoverage,
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
import { capColumns, type CapRows } from './capColumns'
import { SolveConstraints } from './Solve'
import { solveColumns } from './solveColumns'
import './ConstituentPreviewView.css'

function buildColumns(
  preview: PreviewResponse,
  caps: CapRows,
  weighting: { scheme: string; useFreeFloat: boolean; currency: string } | undefined
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
    const names = preview.assets.map((asset) => asset.identifier)
    columns.push(...capColumns(caps, names, weighting.useFreeFloat, weighting.currency))
  }

  /*
   * No pre-cap column (BU-197).
   *
   * BU-192 corrected it to read `uncapped_weight`, which py-beacon publishes
   * only on a name the cap actually held — so the honest version was a column
   * of dashes with a handful of figures in it. The fact it carried is already
   * in the summary line's "capped" and "redistributed", and a column that is
   * empty for all but a few rows costs every reader width to tell most of
   * them nothing.
   */
  columns.push({
    key: 'weight',
    header: 'Weights',
    width: 100,
    align: 'right',
    render: (asset) => (
      <span className={asset.capped ? 'derivation-capped' : undefined}>
        {percent(asset.weight)}
      </span>
    )
  })

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
  /** When the current preview began, for saying how long it has run. */
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined)

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
  /*
   * The index's own currency, which is what the caps have to be converted
   * into to stand beside the weights (BN-189). USD is the engine's default
   * rather than a fact about this index, so it is only the fallback for a
   * document that has not said.
   */
  const currency = document.data?.currency ?? 'USD'
  const weighting = useMemo(
    () =>
      scheme === undefined
        ? undefined
        : {
            scheme: scheme.scheme,
            useFreeFloat: scheme.params?.use_free_float === true,
            currency
          },
    [scheme, currency]
  )
  const wantsCaps = weighting?.scheme === 'MarketCapWeighted'

  const names = useMemo(
    () => (wantsCaps ? (preview.data?.assets ?? []).map((asset) => asset.identifier) : []),
    [wantsCaps, preview.data]
  )
  /*
   * The date the ENGINE resolved to, not the one asked for (BN-181).
   *
   * A market cap read at a different date from the weights invites a
   * comparison that cannot hold — which is exactly the comparison this
   * column exists for. `resolved_date` is the session the weights were
   * actually computed from, so the two columns now describe one day.
   */
  const pricedAt = preview.data?.resolved_date ?? preview.data?.as_of.slice(0, 10) ?? asOf
  const caps = useReferenceRows(names, TABLE_REFERENCE_FIELDS, pricedAt, currency)

  // Which dates the market frame actually holds, for explaining a weighting
  // that could not price anything.
  const coverage = useCoverage()

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
    setStartedAt(Date.now())
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

  /*
   * Working until BOTH halves are in: the resolve, and the caps that belong
   * beside it. `caps.loading` is false when no caps were asked for, so an
   * index that wants none is never held up by a request it never made.
   */
  const working = preview.isPending || caps.loading

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

      {/*
        Elapsed, not just "loading" (BU-191). Resolving a pipeline over a
        large universe prices every name at the date, and a message that
        reads the same at four seconds and four minutes leaves a reader
        unable to tell work from a hang.
      */}
      {/*
        The caps are part of the answer, not a decoration on it (BU-197).

        They arrive in a separate request — several, above a thousand names,
        since that is where the engine caps a batch — and the table was drawn
        the moment the weights landed. So a chunk answering filled a
        SCATTERED subset of a weight-sorted table, which is what Karan saw as
        the caps loading name by name. Waiting costs a few seconds of blank
        and buys a table that is right the first time it is read.
      */}
      {working && indexId !== '' && startedAt !== undefined && (
        <ViewWorking what={indexId} since={startedAt} />
      )}
      {preview.isError && <ViewError error={preview.error} />}

      {/*
        The fallback nobody was told about (BU-186, corrected in BU-187).

        `MarketCapWeighted` prices a name on the EXACT date, with no
        lookback. A date with no bar prices nothing, the total cap is zero,
        and it assigns equal weights while logging server-side — so a
        plausible equally weighted index appears under a market-cap heading.

        The cap columns beside it are NOT the check: `server/reference.py`
        looks back thirty days for those, so they can be full while the
        weighting saw nothing. The date is the check, and `/data/coverage`
        knows which dates the market frame holds.

        Detected rather than reported, because there is nothing in the
        response to report it with. Filed against py-beacon as their #191.
      */}
      {wantsCaps &&
        preview.data !== undefined &&
        !working &&
        looksEquallyWeighted(preview.data.assets) && (
          <p className="preview-warning type-11">
            Every weight here is identical, on an index weighted by market capitalisation —
            py-beacon fell back to equal weights because it could not price a single name at this
            date. {explainEqualWeights(asOf, marketCoverage(coverage.data?.datasets))}. The market
            caps below come from a thirty-day lookback, so they are no guide to what the weighting
            saw.
          </p>
        )}

      {summary !== undefined && preview.data !== undefined && !working && (
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

      {preview.data !== undefined && rows.length > 0 && !working && (
        <>
          <Table
            columns={columns}
            rows={rows}
            getRowId={(asset) => asset.identifier}
            maxBodyHeight={560}
          />
          {solve === undefined ? (
            <p className="preview-footnote type-11">
              {rows.length.toLocaleString('en-US')} names evaluated · asked{' '}
              {preview.data.as_of.slice(0, 10)}
              {pricedAt !== preview.data.as_of.slice(0, 10) && `, priced ${pricedAt}`} · ✓ passed ·
              ✕ excluded here · · already out · the methodology re-resolved at that date, not the
              weights the index has drifted to · preview describes the SAVED definition
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
