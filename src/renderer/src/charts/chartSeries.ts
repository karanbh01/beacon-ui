import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesType,
  type UTCTimestamp
} from 'lightweight-charts'
import { COLORS, type ThemeMode } from '../tokens/tokens'
import type { ChartEvent, Overlay, PaneSeries, Series, SubPanel, Tone } from './LevelChart'
import { histogramOptions, lineOptions, seriesColor, withAlpha } from './theme'
import { toHistogramData, toLineData, toTime } from './transform'

/*
 * What LevelChart adds to its chart, kept apart from the component: the
 * last-value labels, event flags, panes, the overlay and the colours they
 * take (py-beacon's palette and inks; Karan, 2026-10-18).
 */

/** A note as py-beacon writes one: capitalised, and ending in a full stop. */
export function sentence(text: string): string {
  const trimmed = text.trim()
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

/** A main series' colour: its tone if it has one, else its place in the palette. */
export function colourOf(mode: ThemeMode, line: Series, index: number): string {
  return line.tone === undefined ? seriesColor(mode, index) : toneColor(mode, line.tone)
}

export function lastValue(line: Series, colour: string): SeriesMarker<UTCTimestamp>[] {
  const last = line.points[line.points.length - 1]
  if (last === undefined) return []
  return [
    {
      time: toTime(last.date),
      position: 'inBar',
      shape: 'circle',
      size: 0.6,
      color: colour,
      text: last.value.toFixed(2)
    }
  ]
}

/** A palette slot as the colour the theme gives it. */
export function toneColor(mode: ThemeMode, tone: Tone): string {
  if (tone === 'muted') return COLORS[mode]['text-muted']
  if (tone === 'benchmark') return COLORS[mode]['text-secondary']
  if (tone === 'negative') return COLORS[mode].danger
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
export function toMarkers(
  events: readonly ChartEvent[],
  mode: ThemeMode
): SeriesMarker<UTCTimestamp>[] {
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
export function addOverlay(
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
export function addPane(
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
      // py-beacon's single area: the fill at 28% under a line of the same
      // colour, so the panel is context for the line above it.
      bottomColor: withAlpha(color, 0.28),
      lineWidth: 1,
      priceLineVisible: false,
      // No value badge: py-beacon labels a drawdown panel by its title.
      lastValueVisible: false,
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
