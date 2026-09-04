import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesMarkerShape,
  type SeriesType,
  type UTCTimestamp
} from 'lightweight-charts'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { chartOptions, histogramOptions, lineOptions, seriesColor, withAlpha } from './theme'
import { toHistogramData, toLineData, toTime, type Point } from './transform'
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

/**
 * A moment on the time axis rather than a value on it (BU-152).
 *
 * A dividend or a split happened on a day; it has no level and belongs on no
 * price scale. It is drawn as a flag under the first series, which is what
 * makes a step in that line explicable without a second tab open.
 */
export interface ChartEvent {
  date: string
  /** Rendered beside the flag, so it stays to a few words. */
  text: string
  /** The caller's way of telling kinds apart at a glance. */
  shape?: SeriesMarkerShape
}

/**
 * A series in its own units, on the right scale (BU-152).
 *
 * A P/E against a price is the case this exists for: rebasing the two onto
 * one axis would claim they moved together when all they share is a
 * calendar. Drawn dashed, because two solid lines on two scales read as
 * comparable.
 */
export interface Overlay {
  label: string
  points: readonly Point[]
}

export interface LevelChartProps {
  series: readonly Series[]
  mode: ThemeMode
  /** Drawdown or volume, in a second pane sharing the time axis. */
  subPanel?: SubPanel
  /** Flags on the time axis — corporate actions, in Charting's case. */
  events?: readonly ChartEvent[]
  /** One series on the right price scale, in units of its own. */
  overlay?: Overlay
  /**
   * A fixed height in px, or `fill` to take the pane's (BU-132).
   *
   * `fill` is what a chart in a pane wants: fixed at 520 it left space below
   * it in a tall pane and overflowed a short one. The floor is in CSS, since
   * a price line under about 320px is a squiggle.
   */
  height?: number | 'fill'
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
  events,
  overlay,
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
     * Flags hang off the first series, which is the subject's own line: the
     * events belong to that instrument and not to a compared one.
     */
    const anchor = drawn[0]
    const flags =
      events === undefined || events.length === 0 || anchor === undefined
        ? undefined
        : createSeriesMarkers(anchor, toMarkers(events, mode))

    const overlaid =
      overlay === undefined ? undefined : addOverlay(created, overlay, mode, drawn.length)

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
      // Markers first: they are attached to a series that is about to go.
      flags?.detach()
      for (const api of drawn) created.removeSeries(api)
      if (panel !== undefined) created.removeSeries(panel)
      if (overlaid !== undefined) {
        created.removeSeries(overlaid)
        // The axis exists for that one series, so it goes with it.
        created.applyOptions({ rightPriceScale: { visible: false } })
      }
    }
  }, [series, subPanel, events, overlay, mode])

  /*
   * The frame around the plot, with the axes outside it.
   *
   * lightweight-charts draws borders BETWEEN the plot and each axis, which
   * gives two sides of a rectangle at most. The other two are this overlay,
   * inset by the axis widths the chart reports — so the box stays on the
   * plot when the price labels get wider.
   */
  const filling = height === 'fill'
  const [axes, setAxes] = useState({ left: 0, right: 0, bottom: 0 })
  const [plot, setPlot] = useState(0)
  useEffect(() => {
    const created = chart.current
    if (created === null) return undefined

    const measure = (): void => {
      setAxes({
        left: created.priceScale('left').width(),
        // Zero unless an overlay has made the right scale visible (BU-152).
        right: created.priceScale('right').width(),
        bottom: created.timeScale().height()
      })
      // Measured rather than taken from the prop, which may be `fill`.
      setPlot(host.current?.getBoundingClientRect().height ?? 0)
    }
    measure()

    created.timeScale().subscribeSizeChange(measure)
    return () => {
      // Already gone: the create effect's cleanup runs first on unmount.
      if (chart.current === null) return
      created.timeScale().unsubscribeSizeChange(measure)
    }
  }, [series, subPanel, overlay, height, mode])

  return (
    <div
      className={filling ? 'level-chart level-chart-filling' : 'level-chart'}
      style={filling ? undefined : { height }}
    >
      <div className="level-chart-legend type-11" style={{ left: axes.left + LEGEND_INSET }}>
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
        {overlay !== undefined && (
          <span className="level-chart-key">
            <span
              className="level-chart-dash"
              style={{ background: seriesColor(mode, series.length) }}
              aria-hidden="true"
            />
            {overlay.label} · right axis
          </span>
        )}
        {note !== undefined && <span className="level-chart-note">{note}</span>}
      </div>
      <div className="level-chart-plot">
        <div className="level-chart-canvas" ref={host} />
        <div
          className="level-chart-frame"
          style={{ left: axes.left, right: axes.right, bottom: axes.bottom }}
          aria-hidden="true"
        />
      </div>
      {subPanel !== undefined && (
        <span
          className="level-chart-sublabel type-11"
          /*
           * On the subpanel's top edge, and inside the frame.
           *
           * The height moved when the pane became a tenth of the chart
           * (BU-128) — a fixed percentage left it floating in the middle of
           * the price line — and the left offset is the axis width, or it
           * straddles the frame's edge (BU-133).
           */
          style={{
            left: axes.left + LEGEND_INSET,
            bottom: axes.bottom + (plot - axes.bottom) * subPanelShare()
          }}
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
/** Clear of the frame's own hairline, without floating away from it. */
const LEGEND_INSET = 10

/** Relative pane heights when there is a subpanel: nine parts to one. */
const SUBPANEL_SHARE = { main: 9, panel: 1 }

/** The subpanel's share of the panes, as a fraction. */
function subPanelShare(): number {
  return SUBPANEL_SHARE.panel / (SUBPANEL_SHARE.main + SUBPANEL_SHARE.panel)
}

/**
 * Events as markers on a series.
 *
 * Under the bar rather than over it: the line's own shape is what a reader
 * is following, and a flag above it interrupts that. One colour for all of
 * them, since they are context — the shape is what tells the kinds apart.
 */
function toMarkers(events: readonly ChartEvent[], mode: ThemeMode): SeriesMarker<UTCTimestamp>[] {
  return events.map((event) => ({
    time: toTime(event.date),
    position: 'belowBar' as const,
    shape: event.shape ?? 'circle',
    color: COLORS[mode]['text-secondary'],
    text: event.text
  }))
}

/**
 * The overlay's own scale: the right one.
 *
 * The app's price scale is on the left (Figma 289:2846), and
 * lightweight-charts draws no axis for a custom scale id — an overlay scale
 * exists but is never labelled, which for a series in unfamiliar units is
 * the whole of the information.
 */
function addOverlay(
  chart: IChartApi,
  overlay: Overlay,
  mode: ThemeMode,
  index: number
): ISeriesApi<SeriesType> {
  chart.applyOptions({
    rightPriceScale: {
      visible: true,
      borderVisible: false,
      scaleMargins: { top: 0.12, bottom: 0.08 }
    }
  })

  const api = chart.addSeries(LineSeries, {
    ...lineOptions(mode, index),
    lineStyle: LineStyle.Dashed,
    priceScaleId: 'right',
    title: overlay.label
  })
  api.setData(toLineData(overlay.points))
  return api
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
