import { useEffect, useRef, type ReactElement } from 'react'
import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type UTCTimestamp
} from 'lightweight-charts'
import type { ThemeMode } from '../tokens/tokens'
import { chartOptions, histogramOptions, lineOptions, seriesColor, withAlpha } from './theme'
import { toHistogramData, toLineData, type Point } from './transform'
import './LevelChart.css'

export interface Series {
  /** Legend label, e.g. a ticker. */
  label: string
  points: readonly Point[]
}

export interface SubPanel {
  label: string
  points: readonly Point[]
  /** `area` for drawdown (it fills down to zero); `histogram` for volume. */
  kind: 'area' | 'histogram'
}

export interface LevelChartProps {
  series: readonly Series[]
  mode: ThemeMode
  /** Drawdown or volume, in a second pane sharing the time axis. */
  subPanel?: SubPanel
  height?: number
  /** Shown top-right, e.g. "rebased · 100 = 22 Jul 2025" (Figma 289:2861). */
  note?: string
}

/**
 * The level chart, and the shared conventions every price-like chart uses.
 *
 * Built on lightweight-charts (ADR-0002): canvas rendering, a real time axis,
 * crosshair, pan and zoom, and native panes for the subpanel — all of which
 * would be weeks of work in visx and none of which is bespoke to this app.
 *
 * The chart is created once and mutated afterwards. Recreating it on every
 * render would drop the user's pan and zoom, which is the one thing a chart
 * must not forget while they are reading it.
 */
export function LevelChart({
  series,
  mode,
  subPanel,
  height = 420,
  note
}: LevelChartProps): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (host.current === null) return undefined

    const created = createChart(host.current, chartOptions(mode))
    chart.current = created

    return () => {
      chart.current = null
      created.remove()
    }
    // Created once per mount. `mode` is applied by the effect below rather
    // than by recreating, so a theme switch does not reset the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chart.current?.applyOptions(chartOptions(mode))
  }, [mode])

  useEffect(() => {
    const created = chart.current
    if (created === null) return undefined

    const drawn = series.map((line, index) => {
      const api = created.addSeries(LineSeries, { ...lineOptions(mode, index), title: line.label })
      api.setData(toLineData(line.points))
      return api
    })

    const panel = subPanel === undefined ? undefined : addSubPanel(created, subPanel, mode)

    created.timeScale().fitContent()

    return () => {
      for (const api of drawn) created.removeSeries(api)
      if (panel !== undefined) created.removeSeries(panel)
    }
  }, [series, subPanel, mode])

  return (
    <div className="level-chart" style={{ height }}>
      <div className="level-chart-legend type-11">
        {series.map((line, index) => (
          <span key={line.label} className="level-chart-key">
            <span
              className="level-chart-dot"
              style={{ background: seriesColor(mode, index) }}
              aria-hidden="true"
            />
            {line.label}
          </span>
        ))}
        {note !== undefined && <span className="level-chart-note">{note}</span>}
      </div>
      <div className="level-chart-canvas" ref={host} />
      {subPanel !== undefined && (
        <span className="level-chart-sublabel type-11">{subPanel.label}</span>
      )}
    </div>
  )
}

/**
 * The second pane.
 *
 * `paneIndex: 1` is a lightweight-charts v5 feature; before it, a subpanel
 * meant a second chart with its time scales manually kept in sync, which
 * drifts the moment either one is panned.
 */
function addSubPanel(chart: IChartApi, panel: SubPanel, mode: ThemeMode) {
  if (panel.kind === 'histogram') {
    const api = chart.addSeries(HistogramSeries, histogramOptions(mode), 1)
    api.setData(toHistogramData(panel.points))
    return api
  }

  // Drawdown is negative throughout, so the area fills from zero downward —
  // which is the shape that reads as "below the peak" without a legend.
  const api = chart.addSeries(
    AreaSeries,
    {
      lineColor: seriesColor(mode, 0),
      topColor: 'transparent',
      // Tinted, not solid: the subpanel is context for the line above it, and
      // a full-strength fill competes with the series it is describing.
      bottomColor: withAlpha(seriesColor(mode, 0), 0.35),
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      invertFilledArea: true
    },
    1
  )
  api.setData(
    panel.points.map((point) => ({
      time: (Date.parse(`${point.date}T00:00:00Z`) / 1000) as UTCTimestamp,
      value: point.value
    }))
  )
  return api
}
