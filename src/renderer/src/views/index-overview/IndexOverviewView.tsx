import { useMemo, type ReactElement } from 'react'
import { LevelChart } from '../../charts/LevelChart'
import { drawdown, maxDrawdown } from '../../charts/transform'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { WeightBar } from '../../components/WeightBar/WeightBar'
import { useThemeMode } from '../../state/theme'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useOverview, useWeights } from '../shared/beaconQueries'
import {
  fromFraction,
  lastValue,
  oneDay,
  percent,
  signedPercent,
  sinceStart,
  toPoints,
  tone,
  weightRows,
  yearToDate
} from '../shared/indexMetrics'
import './IndexOverviewView.css'

/**
 * Beacon View → Overview. Figma 234:8016.
 *
 * Whole-period metrics come from `/overview`; the period slices Figma also
 * shows — 1D, YTD, since base — are computed from the level series the same
 * response carried. A second round trip for numbers already implied by data
 * in hand would be slower and could disagree with the chart beneath them.
 */
export function IndexOverviewView({ tab, subject, pane }: ViewProps): ReactElement {
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const mode = useThemeMode()
  const overview = useOverview(indexId)
  const weights = useWeights(indexId)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])
  const worst = useMemo(() => maxDrawdown(drawdown(level)), [level])
  const top = useMemo(
    () => weightRows(weights.data?.weights ?? {}, weights.data?.capped ?? []).slice(0, 10),
    [weights.data]
  )

  const metrics = overview.data?.metrics

  return (
    <div className="index-overview-view">
      <PaneHeader
        kind="document"
        title={indexId === '' ? '—' : indexId}
        {...(overview.data === undefined
          ? {}
          : { meta: `${overview.data.name} · ${String(overview.data.observations)} observations` })}
        controls={
          <>
            <Button
              onClick={() => {
                openOrRetarget({
                  page: 'strategy-builder',
                  pane,
                  viewKind: 'index-definition',
                  title: indexId,
                  subject: indexId
                })
              }}
            >
              Open in Strategy Builder
            </Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      {indexId === '' && <ViewEmpty>Pin this pane to an index.</ViewEmpty>}
      {overview.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {overview.isError && <ViewError error={overview.error} />}

      {overview.isSuccess && (
        <>
          <StatStrip>
            <Stat label="INDEX LEVEL" value={lastValue(level)?.toFixed(2) ?? '—'} />
            <Stat label="1D" value={signedPercent(oneDay(level), 2)} tone={tone(oneDay(level))} />
            <Stat
              label="YTD"
              value={signedPercent(yearToDate(level))}
              tone={tone(yearToDate(level))}
            />
            <Stat label="SINCE BASE" value={signedPercent(sinceStart(level))} />
            <Stat label="CAGR" value={percent(fromFraction(metrics?.annualised_return))} />
            <Stat label="VOL" value={percent(fromFraction(metrics?.volatility))} />
            <Stat label="SHARPE" value={metrics?.sharpe_ratio.toFixed(2) ?? '—'} />
            <Stat
              label="MAX DD"
              value={signedPercent(fromFraction(metrics?.max_drawdown))}
              tone="negative"
            />
          </StatStrip>

          {level.length > 0 && (
            <div className="overview-main-row">
              <LevelChart
                mode={mode}
                series={[{ label: indexId, points: level }]}
                panels={[
                  {
                    label: `drawdown · max ${signedPercent(worst?.value)}`,
                    series: [{ points: drawdown(level), kind: 'area' }]
                  }
                ]}
                note={`base ${overview.data.start.slice(0, 10)} · ${String(overview.data.rebalances)} rebalances`}
                height={520}
              />

              <Card title="Top constituents" className="overview-constituents">
                {top.length === 0 && <p className="type-11">No weights published yet.</p>}
                {top.map((row) => (
                  <div className="overview-weight" key={row.ticker}>
                    <span className="overview-ticker">{row.ticker}</span>
                    <WeightBar
                      share={row.share}
                      tone={row.capped ? 'accent' : 'default'}
                      label={`${row.ticker} ${(row.weight * 100).toFixed(2)}%`}
                    />
                    <span className="overview-weight-value">{(row.weight * 100).toFixed(2)}%</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <p className="overview-footnote type-11">
            {overview.data.start.slice(0, 10)} → {overview.data.end.slice(0, 10)} · last rebalance{' '}
            {overview.data.last_rebalance.slice(0, 10)} · effective N{' '}
            {overview.data.concentration.effective_assets.toFixed(1)} · 1D, YTD and since-base are
            derived from the level series
          </p>
        </>
      )}
    </div>
  )
}
