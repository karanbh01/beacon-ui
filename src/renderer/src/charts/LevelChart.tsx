import { useEffect, useRef, useState, type ReactElement } from 'react'
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

    /*
     * Volume is a tenth of the frame (BU-128).
     *
     * Left at their defaults the two panes come out near enough equal, which
     * makes volume look like a second subject rather than context for the
     * line. Stretch factors are relative, so 9 and 1 is the whole rule.
     */
    if (panel !== undefined) {
      const panes = created.panes()
      panes[0]?.setStretchFactor(SUBPANEL_SHARE.main)
      panes[1]?.setStretchFactor(SUBPANEL_SHARE.panel)
    }

    created.timeScale().fitContent()

    return () => {
      /*
       * Nothing to detach from a chart that is already gone.
       *
       * On unmount React runs cleanups in declaration order, so the effect
       * above has already called `created.remove()` and lightweight-charts
       * throws "Value is undefined" out of `removeSeries`. `chart.current` is
       * null exactly when that has happened, and non-null on the ordinary
       * path where this effect is re-running because the data changed.
       */
      if (chart.current === null) return
      for (const api of drawn) created.removeSeries(api)
      if (panel !== undefined) created.removeSeries(panel)
    }
  }, [series, subPanel, mode])

  /*
   * The frame around the plot, with the axes outside it.
   *
   * lightweight-charts draws borders BETWEEN the plot and each axis, which
   * gives two sides of a rectangle at most. The other two are this overlay,
   * inset by the axis widths the chart reports — so the box stays on the
   * plot when the price labels get wider.
   */
  const [axes, setAxes] = useState({ left: 0, bottom: 0 })
  useEffect(() => {
    const created = chart.current
    if (created === null) return undefined

    const measure = (): void => {
      setAxes({ left: created.priceScale('left').width(), bottom: created.timeScale().height() })
    }
    measure()

    created.timeScale().subscribeSizeChange(measure)
    return () => {
      // Already gone: the create effect's cleanup runs first on unmount.
      if (chart.current === null) return
      created.timeScale().unsubscribeSizeChange(measure)
    }
  }, [series, subPanel, height, mode])

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
      <div className="level-chart-plot">
        <div className="level-chart-canvas" ref={host} />
        <div
          className="level-chart-frame"
          style={{ left: axes.left, bottom: axes.bottom }}
          aria-hidden="true"
        />
      </div>
      {subPanel !== undefined && (
        <span
          className="level-chart-sublabel type-11"
          // Sits on the subpanel's top edge, which moved when the pane became
          // a tenth of the frame (BU-128): a fixed percentage left it
          // floating in the middle of the price line.
          style={{ bottom: axes.bottom + (height - axes.bottom) * subPanelShare() }}
        >
          {subPanel.label}
        </span>
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
/** Relative pane heights when there is a subpanel: nine parts to one. */
const SUBPANEL_SHARE = { main: 9, panel: 1 }

/** The subpanel's share of the panes, as a fraction. */
function subPanelShare(): number {
  return SUBPANEL_SHARE.panel / (SUBPANEL_SHARE.main + SUBPANEL_SHARE.panel)
}

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
