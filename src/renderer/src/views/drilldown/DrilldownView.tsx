import { useMemo, type ReactElement } from 'react'
import { LevelChart } from '../../charts/LevelChart'
import { rebase100 } from '../../charts/transform'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { pageSubject } from '../../state/tabs.logic'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useAnalysisOptions } from '../shared/analyticsQueries'
import { useAsset, useOverview, useWeights } from '../shared/beaconQueries'
import { percent, signedPercent, toPoints, tone, weightRows } from '../shared/indexMetrics'
import './DrilldownView.css'

interface HistoryRow {
  rebalance: string
  weight: number
  /** Pre-cap, from `raw_weight_history` (BN-126). */
  raw: number | undefined
}

const HISTORY_COLUMNS: readonly Column<HistoryRow>[] = [
  {
    key: 'rebalance',
    header: 'Rebalance',
    width: 110,
    emphasis: true,
    render: (row) => row.rebalance.slice(0, 10)
  },
  {
    key: 'raw',
    header: 'Raw',
    width: 90,
    align: 'right',
    render: (row) => (row.raw === undefined ? '—' : `${(row.raw * 100).toFixed(2)}%`)
  },
  {
    key: 'weight',
    header: 'Applied',
    width: 90,
    align: 'right',
    render: (row) => `${(row.weight * 100).toFixed(2)}%`
  },
  {
    /*
     * Derived, not reported: a name was capped on a rebalance exactly when
     * less weight was applied than the rules asked for. That is what "capped"
     * means, and comparing the two series says it for every rebalance —
     * where `WeightsView.capped` only ever described the current one.
     */
    key: 'capped',
    header: 'Capped',
    width: 80,
    render: (row) =>
      row.raw !== undefined && row.raw - row.weight > 1e-9 ? (
        <span className="drilldown-capped">at cap</span>
      ) : (
        '—'
      )
  }
]

/**
 * Beacon View → Asset Drilldown. Figma 234:8850.
 *
 * The app's SECOND linked view, and the one that proves the mechanic
 * generalises: the first (Charting) follows Prices on the Data Explorer page,
 * this one follows Weights on Beacon View. Neither knows anything about the
 * other — both just resolve their subject from whatever tab they were linked
 * to (taxonomy §1, archetype 6).
 *
 * Raw and Capped are live since BN-126 added `raw_weight_history`. Capped is
 * derived from the pair rather than reported: a name was held at the cap on a
 * rebalance exactly when less was applied than the rules asked for, which is
 * true for every rebalance in the history — `WeightsView.capped` only ever
 * described the current one.
 */
export function DrilldownView({ tab, subject, pane }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  /*
   * The strategy whose run held this name, from the page's Overview
   * (BU-166). A pin on an older tab says which, where there is no Overview.
   *
   * It used to fall back to a hard-coded 'TECH10', so a drilldown opened from
   * any other index quietly described that one instead.
   */
  const anchor = useWorkspace((state) => pageSubject(state, tab.page, 'overview'))
  const strategyId = anchor === '' ? (tab.pinnedDoc ?? '') : anchor

  const mode = useThemeMode()
  const asset = useAsset(strategyId, identifier)
  const overview = useOverview(strategyId)
  const options = useAnalysisOptions()
  const weights = useWeights(strategyId)

  const setSubject = useWorkspace((state) => state.setSubject)
  const severLink = useWorkspace((state) => state.severLink)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const sourceTitle = useWorkspace((state) =>
    tab.linkSourceId === undefined
      ? undefined
      : state.tabs.find((candidate) => candidate.id === tab.linkSourceId)?.title
  )

  const assetPoints = useMemo(() => rebase100(toPoints(asset.data?.price)), [asset.data])
  const money = currenciesOf(asset.data)
  // What the figures are measured against: the run's tracked comparator
  // since py-beacon 0.11.0, a code the catalogue names, and the run itself
  // before it. Lower case, as it sits mid-sentence: "against the optimised index".
  const comparator = asset.data?.against ?? undefined
  const comparatorName =
    comparator === undefined
      ? undefined
      : (options.data?.names.comparator?.[comparator] ?? comparator).toLowerCase()
  const against = comparatorName ?? strategyId
  const indexPoints = useMemo(() => rebase100(toPoints(overview.data?.level)), [overview.data])

  const ranked = useMemo(
    () => weightRows(weights.data?.weights ?? {}, weights.data?.capped ?? []),
    [weights.data]
  )
  const mine = ranked.find((row) => row.ticker === identifier)

  const history = useMemo<HistoryRow[]>(() => {
    const raw = asset.data?.raw_weight_history ?? {}
    return Object.entries(asset.data?.weight_history ?? {})
      .map(([rebalance, weight]) => ({ rebalance, weight, raw: raw[rebalance] }))
      .sort((a, b) => b.rebalance.localeCompare(a.rebalance))
  }, [asset.data])

  return (
    <div className="drilldown-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(sourceTitle === undefined ? {} : { linkedTo: sourceTitle })}
        {...(asset.data === undefined
          ? {}
          : {
              meta: `held by ${strategyId} · ${asset.data.index_id} · ${String(asset.data.rebalances_held)} rebalances held`
            })}
        onQuery={(next) => {
          if (tab.archetype === 'linked') severLink(tab.id)
          setSubject(tab.id, next)
        }}
        onSever={() => {
          severLink(tab.id)
        }}
        controls={
          <>
            <Button
              onClick={() => {
                openOrRetarget({
                  page: 'data-explorer',
                  pane,
                  viewKind: 'prices',
                  title: 'Prices',
                  subject: identifier
                })
              }}
            >
              Open in Data Explorer
            </Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      {identifier === '' && (
        <ViewEmpty figure="ticker">
          {tab.archetype === 'linked'
            ? 'The tab this one follows has no constituent selected yet.'
            : 'Type a constituent to drill into it.'}
        </ViewEmpty>
      )}
      {asset.isPending && identifier !== '' && <ViewLoading what={identifier} />}
      {asset.isError && <ViewError error={asset.error} />}

      {asset.isSuccess && (
        <>
          <SummaryLine
            items={[
              {
                label: 'weight',
                value: mine === undefined ? '—' : `${(mine.weight * 100).toFixed(2)}%`
              },
              {
                label: 'rank',
                value: mine === undefined ? '—' : `${String(mine.rank)} of ${String(ranked.length)}`
              },
              { label: 'capped', value: mine?.capped === true ? 'yes' : 'no' },
              {
                label: `total return${inCurrency(money.returns)}`,
                value: signedPercent(hundredfold(asset.data.total_return)),
                tone: tone(asset.data.total_return ?? undefined)
              },
              {
                label: `excess vs ${against}${inCurrency(money.returns)}`,
                value: signedPercent(hundredfold(asset.data.excess_return)),
                tone: tone(asset.data.excess_return ?? undefined)
              },
              { label: `beta vs ${against}`, value: twoPlaces(asset.data.beta) },
              { label: 'tracking error', value: percent(hundredfold(asset.data.tracking_error)) }
            ]}
          />

          <div className="drilldown-main-row">
            {assetPoints.length > 0 && (
              <LevelChart
                mode={mode}
                series={[
                  { label: `${identifier}${inCurrency(money.price)}`, points: assetPoints },
                  ...(indexPoints.length === 0
                    ? []
                    : [{ label: `${strategyId}${inCurrency(money.returns)}`, points: indexPoints }])
                ]}
                note={`rebased · 100 = ${assetPoints[0]?.date ?? ''}`}
                height={440}
                reference={100}
              />
            )}

            <Card title="Weight at rebalance" flush className="drilldown-history">
              {history.length === 0 && (
                <p className="drilldown-empty type-11">Never held at a rebalance.</p>
              )}
              {history.length > 0 && (
                <Table
                  columns={HISTORY_COLUMNS}
                  rows={history}
                  getRowId={(row) => row.rebalance}
                  maxBodyHeight={360}
                />
              )}
            </Card>
          </div>

          <p className="drilldown-footnote type-11">
            {basisOf(asset.data, comparatorName)}
            {String(asset.data.observations)} observations · correlation{' '}
            {/*
              "index_return" is the comparator's return: the run's from 0.9.0,
              when the engine measured a name against the run that held it,
              and the tracked comparator's from 0.11.0.
            */}
            {twoPlaces(asset.data.correlation)} · {against} return{' '}
            {signedPercent(hundredfold(asset.data.index_return))}
            {asset.data.figures_unavailable != null && ` · ${asset.data.figures_unavailable}`}
            {tab.archetype === 'linked' && ` · linked to ${sourceTitle ?? 'another tab'}`}
          </p>
        </>
      )}
    </div>
  )
}

/** A fraction as a percentage; a figure the engine left blank (0.11.0) as none. */
function hundredfold(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value * 100
}

function twoPlaces(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(2)
}

/**
 * What the figures are measured on, as py-beacon 0.11.0 says (BN-454): the
 * run's daily total returns over the analysis window. An engine before it
 * says nothing, and nor does this.
 */
function basisOf(
  asset: {
    basis?: string | null
    currency?: string | null
    start?: string | null
    end?: string | null
  },
  comparator: string | undefined
): string {
  if (asset.basis == null) return ''
  const basis = `${asset.basis.charAt(0).toUpperCase()}${asset.basis.slice(1)}`
  const currency = asset.currency == null ? '' : ` in ${asset.currency}`
  const window = asset.start == null || asset.end == null ? '' : `, ${asset.start} to ${asset.end}`
  const against = comparator === undefined ? '' : `, against the ${comparator}`
  return `${basis} total returns${currency}${window}${against} · `
}

/**
 * What the asset view's numbers are in (BU-220, py-beacon 0.3.0).
 *
 * The returns, beta and tracking error are measured in the index's currency
 * (the portfolio's since 0.11.0) and the price in the name's own, so for a GBP name in a USD index the
 * headline return no longer matches where the price line ends — they are
 * labelled, or the two read as one number disagreeing with itself. A name
 * with no currency on record is priced as if in the index's, which is what
 * the engine does with it. An engine before 0.3.0 says neither, and nor
 * does this: a guessed currency is worse than none.
 */
function currenciesOf(
  asset: { currency?: string | null; price_currency?: string | null } | undefined
): { returns?: string; price?: string } {
  const returns = asset?.currency ?? undefined
  if (returns === undefined) return {}
  return { returns, price: asset?.price_currency ?? returns }
}

function inCurrency(currency: string | undefined): string {
  return currency === undefined ? '' : ` (${currency})`
}
