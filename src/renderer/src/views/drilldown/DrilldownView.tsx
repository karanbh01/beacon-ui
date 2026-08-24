import { useMemo, type ReactElement } from 'react'
import { LevelChart } from '../../charts/LevelChart'
import { rebase100 } from '../../charts/transform'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
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
  // A drilldown is always into some index; the pin says which.
  const indexId = tab.pinnedDoc ?? 'TECH10'

  const mode = useThemeMode()
  const asset = useAsset(indexId, identifier)
  const overview = useOverview(indexId)
  const weights = useWeights(indexId)

  const setSubject = useWorkspace((state) => state.setSubject)
  const severLink = useWorkspace((state) => state.severLink)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const sourceTitle = useWorkspace((state) =>
    tab.linkSourceId === undefined
      ? undefined
      : state.tabs.find((candidate) => candidate.id === tab.linkSourceId)?.title
  )

  const assetPoints = useMemo(() => rebase100(toPoints(asset.data?.price)), [asset.data])
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
        tabId={tab.id}
        subject={identifier}
        {...(sourceTitle === undefined ? {} : { linkedTo: sourceTitle })}
        {...(asset.data === undefined
          ? {}
          : {
              meta: `constituent of ${indexId} · ${String(asset.data.rebalances_held)} rebalances held`
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
        <ViewEmpty>
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
                label: 'index weight',
                value: mine === undefined ? '—' : `${(mine.weight * 100).toFixed(2)}%`
              },
              {
                label: 'rank',
                value: mine === undefined ? '—' : `${String(mine.rank)} of ${String(ranked.length)}`
              },
              { label: 'capped', value: mine?.capped === true ? 'yes' : 'no' },
              {
                label: 'total return',
                value: signedPercent(asset.data.total_return * 100),
                tone: tone(asset.data.total_return)
              },
              {
                label: 'excess vs index',
                value: signedPercent(asset.data.excess_return * 100),
                tone: tone(asset.data.excess_return)
              },
              { label: `beta vs ${indexId}`, value: asset.data.beta.toFixed(2) },
              { label: 'tracking error', value: percent(asset.data.tracking_error * 100) }
            ]}
          />

          <div className="drilldown-main-row">
            {assetPoints.length > 0 && (
              <LevelChart
                mode={mode}
                series={[
                  { label: identifier, points: assetPoints },
                  ...(indexPoints.length === 0 ? [] : [{ label: indexId, points: indexPoints }])
                ]}
                note={`rebased · 100 = ${assetPoints[0]?.date ?? ''}`}
                height={440}
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
            {String(asset.data.observations)} observations · correlation{' '}
            {asset.data.correlation.toFixed(2)} · index return{' '}
            {signedPercent(asset.data.index_return * 100)}
            {tab.archetype === 'linked' && ` · linked to ${sourceTitle ?? 'another tab'}`}
          </p>
        </>
      )}
    </div>
  )
}
