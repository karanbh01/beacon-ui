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

/** Palette slot, resolved against the theme by the chart (BU-157). */
export type Tone = 'accent' | 'second' | 'third' | 'muted'

export interface PaneSeries {
  points: readonly Point[]
  /** `area` for drawdown (it fills to zero); `histogram` for volume and bars. */
  kind: 'line' | 'area' | 'histogram'
  tone?: Tone
  /**
   * Horizontal reference lines, in the pane's own units.
   *
   * RSI's 30 and 70 are the indicator rather than decoration — a line with
   * no bands is a wiggle out of context — and MACD's zero is where the
   * crossing everyone is watching for happens.
   */
  guides?: readonly number[]
  /**
   * Whether the axis carries this series' last value.
   *
   * On by default for a line, because a reader wants MACD's current number —
   * but not for all three of MACD's series at once, which stacks badges on
   * top of each other and hides the axis behind them.
   */
  badge?: boolean
}

/**
 * A pane under the price, sharing its time axis.
 *
 * More than one series in it, because MACD is a line, a signal and a
 * histogram that only mean anything together (BU-157) — volume, the case
 * this started as, is simply a pane with one.
 */
export interface SubPanel {
  label: string
  series: readonly PaneSeries[]
  /** Height against the price pane's nine. Volume takes one, a study two. */
  share?: number
}

/**
 * A line on the PRICE scale: a moving average, and nothing else so far.
 *
 * Distinct from `Overlay`, which brings its own axis. A study is in the same
 * units as the line it is drawn over, which is exactly why it can share the
 * scale — and why drawing it anywhere else would be wrong.
 */
export interface Study {
  label: string
  points: readonly Point[]
  tone?: Tone
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
  /** Drawdown, volume, MACD — panes under the price, in the order given. */
  panels?: readonly SubPanel[]
  /** Lines on the price scale itself, e.g. moving averages (BU-157). */
  studies?: readonly Study[]
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
  panels,
  studies,
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

    /*
     * Studies share the price scale, so they are lines on pane 0 like the
     * instruments themselves — thinner and quieter, because a moving average
     * is a reading of the line rather than a second subject.
     */
    const drawnStudies = (studies ?? []).map((study) => {
      const api = created.addSeries(LineSeries, {
        color: toneColor(mode, study.tone ?? 'muted'),
        lineWidth: 1,
        // No title and no last value: the legend above already names every
        // study, and a badge per average buries the price axis under them.
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      })
      api.setData(toLineData(study.points))
      return api
    })

    const drawnPanels = (panels ?? []).map((panel, index) => addPane(created, panel, mode, index))

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
     * Left at their defaults the panes come out near enough equal, which
     * makes volume look like a second subject rather than context for the
     * line. Stretch factors are relative, so the price pane's nine against a
     * pane's one — or two, for a study somebody has to read values off — is
     * the whole rule.
     */
    if (drawnPanels.length > 0) {
      const panes = created.panes()
      panes[0]?.setStretchFactor(MAIN_SHARE)
      ;(panels ?? []).forEach((panel, index) => {
        panes[index + 1]?.setStretchFactor(shareOf(panel))
      })
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
      for (const api of [...drawn, ...drawnStudies, ...drawnPanels.flat()]) {
        created.removeSeries(api)
      }
      if (overlaid !== undefined) {
        created.removeSeries(overlaid)
        // The axis exists for that one series, so it goes with it.
        created.applyOptions({ rightPriceScale: { visible: false } })
      }
    }
  }, [series, panels, studies, events, overlay, mode])

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
  }, [series, panels, overlay, height, mode])

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
        {(studies ?? []).map((study) => (
          <span key={study.label} className="level-chart-key">
            <span
              className="level-chart-dot"
              style={{ background: toneColor(mode, study.tone ?? 'muted') }}
              aria-hidden="true"
            />
            {study.label}
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
      {(panels ?? []).map((panel, index) => (
        <span
          key={panel.label}
          className="level-chart-sublabel type-11"
          /*
           * On its pane's top edge, and inside the frame.
           *
           * Measured from the shares rather than from a fixed percentage: the
           * label floated in the middle of the price line when volume became
           * a tenth of the chart (BU-128), and with three panes there is no
           * one percentage to hard-code anyway. The left offset is the axis
           * width, or the label straddles the frame's edge (BU-133).
           */
          style={{
            left: axes.left + LEGEND_INSET,
            bottom: axes.bottom + (plot - axes.bottom) * shareBelow(panels ?? [], index)
          }}
        >
          {panel.label}
        </span>
      ))}
    </div>
  )
}

/** Clear of the frame's own hairline, without floating away from it. */
const LEGEND_INSET = 10

/** The price pane's share, against a panel's one. */
const MAIN_SHARE = 9

function shareOf(panel: SubPanel): number {
  return panel.share ?? 1
}

/**
 * How much of the plot sits at or below pane `index`, as a fraction.
 *
 * Which is where that pane's top edge is, measured from the bottom — panes
 * are added downwards, so the last one in the list is the lowest on screen.
 */
function shareBelow(panels: readonly SubPanel[], index: number): number {
  const total = panels.reduce((sum, panel) => sum + shareOf(panel), MAIN_SHARE)
  const below = panels.slice(index).reduce((sum, panel) => sum + shareOf(panel), 0)
  return below / total
}

/** A palette slot as the colour the theme gives it. */
function toneColor(mode: ThemeMode, tone: Tone): string {
  if (tone === 'muted') return COLORS[mode]['text-muted']
  if (tone === 'second') return seriesColor(mode, 1)
  if (tone === 'third') return seriesColor(mode, 2)
  return seriesColor(mode, 0)
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

/**
 * One pane under the price, with everything in it.
 *
 * `paneIndex` is a lightweight-charts v5 feature; before it, a subpanel meant
 * a second chart with its time scales manually kept in sync, which drifts the
 * moment either one is panned. Pane 0 is the price, so the first panel is 1.
 */
function addPane(
  chart: IChartApi,
  panel: SubPanel,
  mode: ThemeMode,
  index: number
): ISeriesApi<SeriesType>[] {
  const pane = index + 1
  return panel.series.map((entry) => addPaneSeries(chart, entry, mode, pane))
}

function addPaneSeries(
  chart: IChartApi,
  entry: PaneSeries,
  mode: ThemeMode,
  pane: number
): ISeriesApi<SeriesType> {
  if (entry.kind === 'histogram') {
    const api = chart.addSeries(
      HistogramSeries,
      { ...histogramOptions(mode), color: toneColor(mode, entry.tone ?? 'muted') },
      pane
    )
    api.setData(toHistogramData(entry.points))
    return api
  }

  if (entry.kind === 'line') {
    const api = chart.addSeries(
      LineSeries,
      {
        color: toneColor(mode, entry.tone ?? 'accent'),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: entry.badge ?? true,
        crosshairMarkerVisible: false
      },
      pane
    )
    api.setData(toLineData(entry.points))
    addGuides(api, entry, mode)
    return api
  }

  // Drawdown is negative throughout, so the area fills from zero downward —
  // which is the shape that reads as "below the peak" without a legend.
  const color = toneColor(mode, entry.tone ?? 'accent')
  const api = chart.addSeries(
    AreaSeries,
    {
      lineColor: color,
      topColor: 'transparent',
      // Tinted, not solid: the subpanel is context for the line above it, and
      // a full-strength fill competes with the series it is describing.
      bottomColor: withAlpha(color, 0.35),
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      invertFilledArea: true
    },
    pane
  )
  api.setData(toLineData(entry.points))
  addGuides(api, entry, mode)
  return api
}

/** Quiet, unlabelled: a guide is a level to read against, not a value. */
function addGuides(api: ISeriesApi<SeriesType>, entry: PaneSeries, mode: ThemeMode): void {
  for (const price of entry.guides ?? []) {
    api.createPriceLine({
      price,
      color: COLORS[mode].divider,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false
    })
  }
}
