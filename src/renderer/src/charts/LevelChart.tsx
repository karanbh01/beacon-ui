import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarkerShape
} from 'lightweight-charts'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import { chartOptions, lineOptions, seriesColor } from './theme'
import { addOverlay, addPane, colourOf, sentence, toMarkers, toneColor } from './chartSeries'
import { toLineData, toTime, type Point } from './transform'
import { ChartReadout } from './ChartReadout'
import { plainFigure, useReadout, type ReadoutEntry } from './readout'
import { PaneGaps } from './PaneGaps'
import { PANE_GAP, fitPaneMargins, measurePanes, type PaneBox } from './paneGeometry'
import './LevelChart.css'

export interface Series {
  /** Legend label, e.g. a ticker. */
  label: string
  points: readonly Point[]
  /** Its colour, when not its place in the palette: a benchmark is text-secondary. */
  tone?: Tone
}

/**
 * Palette slot, resolved against the theme by the chart (BU-157).
 *
 * `benchmark` is py-beacon's benchmark ink (text-secondary) and `negative`
 * its drawdown red (danger).
 */
export type Tone = 'accent' | 'second' | 'third' | 'muted' | 'benchmark' | 'negative'

export interface PaneSeries {
  points: readonly Point[]
  /** `area` for drawdown (it fills to zero); `histogram` for volume and bars. */
  kind: 'line' | 'area' | 'histogram'
  tone?: Tone
  /** Its name in the hover popup; the panel's own name when it has one series. */
  label?: string
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
  /** How the hover popup prints its values; two decimals when omitted. */
  format?: (value: number) => string
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
  /** Shown under the chart as py-beacon's "Notes:" line. */
  note?: string
  /**
   * A reference level on the price scale, behind the lines: 100 for a
   * rebased chart, as py-beacon draws it, in the border colour.
   */
  reference?: number
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
  note,
  reference
}: LevelChartProps): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const lines = useRef<{ api: ISeriesApi<'Line'>; index: number }[]>([])
  const plotRef = useRef<HTMLDivElement>(null)
  const readable = useRef<ReadoutEntry[]>([])

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

  // After the chart is created, so the popup subscribes to a chart that exists.
  const readout = useReadout(chart, readable, plotRef)

  useEffect(() => {
    const created = chart.current
    if (created === null) return undefined

    const drawn = series.map((line, index) => {
      const api = created.addSeries(LineSeries, {
        ...lineOptions(mode, index),
        ...(line.tone === undefined ? {} : { color: toneColor(mode, line.tone) })
      })
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

    // Remembered for the end labels, which are placed from the chart's own
    // coordinates once it has laid out.
    lines.current = drawn.map((api, index) => ({ api, index }))

    /*
     * Events hang off the first series, which is the subject's own line:
     * they belong to that instrument and not to a compared one.
     */
    const anchor = drawn[0]
    const flags =
      events === undefined || events.length === 0 || anchor === undefined
        ? []
        : [createSeriesMarkers(anchor, toMarkers(events, mode))]
    if (anchor !== undefined && reference !== undefined) {
      anchor.createPriceLine({
        price: reference,
        color: COLORS[mode].border,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false
      })
    }

    const overlaid =
      overlay === undefined ? undefined : addOverlay(created, overlay, mode, drawn.length)

    // What the hover popup lists, in the legend's order and then the panels'.
    readable.current = [
      ...drawn.map((api, index) => ({
        api,
        label: series[index]?.label ?? '',
        colour: series[index] === undefined ? '' : colourOf(mode, series[index], index),
        format: plainFigure
      })),
      ...drawnStudies.map((api, index) => {
        const study = studies?.[index]
        return {
          api,
          label: study?.label ?? '',
          colour: toneColor(mode, study?.tone ?? 'muted'),
          format: plainFigure
        }
      }),
      ...(overlaid === undefined || overlay === undefined
        ? []
        : [
            {
              api: overlaid,
              label: overlay.label,
              colour: seriesColor(mode, series.length),
              format: plainFigure
            }
          ]),
      ...drawnPanels.flatMap((apis, index) => panelEntries(apis, panels?.[index], mode))
    ]

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
      for (const markers of flags) markers.detach()
      for (const api of [...drawn, ...drawnStudies, ...drawnPanels.flat()]) {
        created.removeSeries(api)
      }
      if (overlaid !== undefined) {
        created.removeSeries(overlaid)
        // The axis exists for that one series, so it goes with it.
        created.applyOptions({ rightPriceScale: { visible: false } })
      }
    }
  }, [series, panels, studies, events, overlay, mode, reference])

  /*
   * What the overlays are placed from: the axes' widths, each pane's box and
   * each line's end, all read off the chart once it has laid out.
   */
  const filling = height === 'fill'
  const [axes, setAxes] = useState({ left: 0, right: 0, width: 0 })
  const [boxes, setBoxes] = useState<PaneBox[]>([])
  const [ends, setEnds] = useState<EndLabel[]>([])
  useEffect(() => {
    const created = chart.current
    if (created === null) return undefined

    const measure = (): void => {
      /*
       * Nothing to measure once the chart is gone (BU-171).
       *
       * A size change delivered after `remove()` reaches a disposed object,
       * and lightweight-charts throws "Value is null" out of the first
       * `priceScale` read rather than returning nothing. The cleanup below
       * already refuses to unsubscribe from a chart that has gone; this is
       * the half that still runs — a pane closed mid-resize in the app, and
       * about one test run in three.
       */
      if (chart.current === null) return

      setAxes({
        left: created.priceScale('left').width(),
        // Zero unless an overlay has made the right scale visible (BU-152).
        right: created.priceScale('right').width(),
        width: host.current?.clientWidth ?? 0
      })
      if (host.current !== null) {
        const measured = measurePanes(created, host.current)
        fitPaneMargins(created, measured)
        setBoxes(measured)
      }
      setEnds(endLabels(created, lines.current, series, mode))
    }
    measure()
    // A pane dragged taller changes no size the time scale reports.
    const panes = new ResizeObserver(measure)
    for (const pane of created.panes()) {
      const element = pane.getHTMLElement()
      if (element !== null) panes.observe(element)
    }
    /*
     * Once more after the chart's first paint: it lays out on the next
     * frame, and until then the price scale has not fitted the new data, so
     * the end labels would be placed against the old range.
     */
    const frame = requestAnimationFrame(measure)

    created.timeScale().subscribeSizeChange(measure)
    created.timeScale().subscribeVisibleLogicalRangeChange(measure)
    return () => {
      cancelAnimationFrame(frame)
      panes.disconnect()
      // Already gone: the create effect's cleanup runs first on unmount.
      if (chart.current === null) return
      created.timeScale().unsubscribeSizeChange(measure)
      created.timeScale().unsubscribeVisibleLogicalRangeChange(measure)
    }
  }, [series, panels, overlay, height, mode])

  const keys = series.length + (studies ?? []).length + (overlay === undefined ? 0 : 1)

  return (
    <div className={filling ? 'level-chart-block level-chart-filling' : 'level-chart-block'}>
      <div className="level-chart" style={filling ? undefined : { height }}>
        {/* A legend only where there is more than one line to tell apart. */}
        {keys > 1 && (
          <div
            className="level-chart-legend"
            style={{ right: axes.right + END_GUTTER + LEGEND_INSET }}
          >
            {series.map((line, index) => (
              <span key={line.label} className="level-chart-key">
                <span
                  className="level-chart-line"
                  style={{ background: colourOf(mode, line, index) }}
                  aria-hidden="true"
                />
                {line.label}
              </span>
            ))}
            {(studies ?? []).map((study) => (
              <span key={study.label} className="level-chart-key">
                <span
                  className="level-chart-line"
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
                  style={{ borderColor: seriesColor(mode, series.length) }}
                  aria-hidden="true"
                />
                {overlay.label} (right)
              </span>
            )}
          </div>
        )}
        <div className="level-chart-plot" ref={plotRef}>
          <div className="level-chart-canvas" ref={host} />
          <PaneGaps boxes={boxes} left={axes.left} right={axes.width - axes.right} />
          {/*
            Each line's last value at its end, as py-beacon labels it: a dot
            and the figure in the line's colour, in a gutter right of the plot.
          */}
          {ends.map((end) => (
            <Fragment key={end.key}>
              <span
                className="level-chart-end-dot"
                style={{ left: end.x, top: end.y, background: end.colour }}
              />
              <span
                className="level-chart-end"
                style={{ left: end.x, top: end.textY, color: end.colour }}
              >
                {end.text}
              </span>
            </Fragment>
          ))}
          {(panels ?? []).map((panel, index) => (
            <span
              key={panel.label}
              className="level-chart-sublabel"
              /*
               * At the top of its own pane, under the gap and clear of the
               * axis (BU-133), from where the pane really is (BU-128).
               */
              style={{
                left: axes.left + LEGEND_INSET,
                top: (boxes[index + 1]?.top ?? 0) + PANE_GAP
              }}
            >
              {panel.label}
            </span>
          ))}
          <ChartReadout readout={readout} />
        </div>
      </div>
      {note !== undefined && <p className="level-chart-notes">Notes: {sentence(note)}</p>}
    </div>
  )
}

/** Clear of the axis line, without floating away from it. */
const LEGEND_INSET = 10

/** Room right of the plot for the end labels; matches the CSS padding. */
const END_GUTTER = 48

/** A line's last value, placed at its end. */
interface EndLabel {
  key: string
  x: number
  /** Where the line ends, which is where its dot goes. */
  y: number
  /** Where its figure goes: the line end, unless that collides with another. */
  textY: number
  colour: string
  text: string
}

/**
 * Where each line ends, in the chart's own coordinates: the time axis for
 * x (offset by the left price scale) and the series' scale for y. A line
 * whose end is scrolled out of view has no label.
 */
function endLabels(
  chart: IChartApi,
  drawn: readonly { api: ISeriesApi<'Line'>; index: number }[],
  series: readonly Series[],
  mode: ThemeMode
): EndLabel[] {
  const left = chart.priceScale('left').width()
  const placed = drawn.flatMap(({ api, index }) => {
    const line = series[index]
    const last = line?.points[line.points.length - 1]
    if (line === undefined || last === undefined) return []
    const x = chart.timeScale().timeToCoordinate(toTime(last.date))
    const y = api.priceToCoordinate(last.value)
    if (x === null || y === null) return []
    return [
      {
        key: line.label,
        x: x + left,
        y,
        textY: y,
        colour: colourOf(mode, line, index),
        text: last.value.toLocaleString('en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        })
      }
    ]
  })
  return spread(placed)
}

/** A label's height at 10px, the least two end labels may sit apart. */
const LABEL_GAP = 12

/**
 * Lines that finish close together would print their figures on top of each
 * other. Taken top to bottom, each figure moves down until it clears the one
 * above, so the order still matches the lines' order at the end. The dots
 * stay on the lines.
 */
function spread(labels: EndLabel[]): EndLabel[] {
  const sorted = [...labels].sort((one, other) => one.y - other.y)
  let floor = -Infinity
  return sorted.map((label) => {
    const textY = Math.max(label.y, floor)
    floor = textY + LABEL_GAP
    return { ...label, textY }
  })
}

/** The price pane's share, against a panel's one. */
const MAIN_SHARE = 9

function shareOf(panel: SubPanel): number {
  return panel.share ?? 1
}

/**
 * A panel's series for the hover popup: each by its own name, or by the
 * panel's ("Drawdown", from "Drawdown · max -9.2%"), in the colour it is
 * drawn in.
 */
function panelEntries(
  apis: readonly ReadoutEntry['api'][],
  panel: SubPanel | undefined,
  mode: ThemeMode
): ReadoutEntry[] {
  if (panel === undefined) return []
  const name = panel.label.split(' · ')[0] ?? panel.label
  return apis.flatMap((api, index) => {
    const entry = panel.series[index]
    if (entry === undefined) return []
    const tone = entry.tone ?? (entry.kind === 'histogram' ? 'muted' : 'accent')
    return [
      {
        api,
        label: entry.label ?? name,
        colour: toneColor(mode, tone),
        format: panel.format ?? plainFigure
      }
    ]
  })
}
