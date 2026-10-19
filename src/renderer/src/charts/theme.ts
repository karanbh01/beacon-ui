import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type DeepPartial,
  type LineWidth,
  type ChartOptions
} from 'lightweight-charts'
import { COLORS, type ThemeMode } from '../tokens/tokens'

/**
 * The chart theme, built from the same tokens the CSS uses.
 *
 * Charts paint to a canvas and cannot read CSS custom properties, so they take
 * the resolved literal from `COLORS` instead. That is the whole reason
 * `tokens.ts` emits literals alongside `tokens.css` — the two are generated
 * from one source, so a chart cannot drift from the surface around it.
 */

/*
 * py-beacon's plotting face (Karan, 2026-10-18): Inter Tight Light, under
 * the name type.css gives the Light file, since a canvas font takes no
 * weight and would otherwise draw the ticks in Regular.
 */
const FONT_DATA = "'Inter Tight Light', 'Inter Tight', 'Inter', sans-serif"

/*
 * py-beacon's series palette, in order (beacon/plot/themes.py, SERIES):
 * nine colours, then context greys. Not tokens: the tokens' series-2 and
 * series-3 are the app's, and py-beacon's charts do not use them.
 */
const PALETTE: Record<ThemeMode, readonly string[]> = {
  light: [
    '#4a88c7',
    '#070f67',
    '#cc0088',
    '#ff70cf',
    '#adbc10',
    '#20a464',
    '#404f25',
    '#f0200d',
    '#682107',
    '#000000',
    '#262626',
    '#4d4d4d',
    '#737373',
    '#999999',
    '#bfbfbf'
  ],
  dark: [
    '#6fa7dc',
    '#0072a3',
    '#beacec',
    '#7d59d9',
    '#6bcf9a',
    '#ccf403',
    '#09714e',
    '#e0474b',
    '#ed8a83',
    '#ffffff',
    '#f2f2f2',
    '#cccccc',
    '#a6a6a6',
    '#808080',
    '#595959'
  ]
}

/** Grey for a bar with no sign to colour it: py-beacon's palette-14. */
const UNSIGNED = 13

/** The nine series colours, before the greys. */
export function seriesColors(mode: ThemeMode): string[] {
  return PALETTE[mode].slice(0, 9)
}

export function seriesColor(mode: ThemeMode, index: number): string {
  const palette = seriesColors(mode)
  return palette[index % palette.length] ?? COLORS[mode].accent
}

/**
 * A token colour at partial opacity, as `rgba()`.
 *
 * Area fills need it and the tokens are opaque 6-digit hex. Returned as
 * rgba rather than 8-digit hex because lightweight-charts' own parser is the
 * consumer, and rgba is the form it is certain to accept.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (value.length < 6) return hex
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`
}

/**
 * py-beacon's chart design (Karan, 2026-10-18; beacon/plot/style.py):
 *
 * - no gridlines in either direction
 * - axis lines left and bottom only, ticks on them, all in text-primary
 * - ticks, legend and notes in Inter Tight Light
 * - price scale on the LEFT
 * - a dashed vertical crosshair in text-secondary, and no horizontal one
 *
 * They live here rather than per-chart so a second chart cannot quietly
 * disagree with the first.
 */
export function chartOptions(mode: ThemeMode): DeepPartial<ChartOptions> {
  const token = COLORS[mode]

  return {
    layout: {
      // `canvas`, not `surface` — surface is translucent, and a chart drawn
      // on it would blend with whatever happens to sit behind the pane.
      background: { type: ColorType.Solid, color: token.canvas },
      textColor: token['text-primary'],
      fontFamily: FONT_DATA,
      fontSize: 10,
      attributionLogo: false,
      // Invisible: the upper pane's bottom axis line and the gap under it
      // are drawn over the chart (PaneGaps). Still there to drag.
      panes: {
        separatorColor: 'rgba(0, 0, 0, 0)',
        separatorHoverColor: token['sidebar-active-bg'],
        enableResize: true
      }
    },
    grid: {
      horzLines: { visible: false },
      vertLines: { visible: false }
    },
    leftPriceScale: {
      visible: true,
      borderVisible: true,
      borderColor: token['text-primary'],
      ticksVisible: true,
      scaleMargins: { top: 0.08, bottom: 0.04 }
    },
    rightPriceScale: { visible: false },
    timeScale: {
      borderVisible: true,
      borderColor: token['text-primary'],
      ticksVisible: true,
      // The design labels months, not days, and fitting the whole range is
      // what a range control implies — the user picked the window already.
      fixLeftEdge: true,
      fixRightEdge: true
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: token['text-secondary'],
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: token['text-secondary']
      },
      horzLine: { visible: false, labelVisible: false }
    },
    /*
     * Ranging is deliberate or it does not happen (BU-134).
     *
     * The wheel belonged to the chart and was taken from the pane it sits in
     * — scrolling a pane with the pointer over a chart zoomed the chart
     * instead, which is the wrong reading of that gesture nearly every time.
     * Dragging an axis is unambiguous, so both axes take it, and a
     * double-click puts either back to automatic.
     */
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      mouseWheel: false,
      pinch: false,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true }
    },
    autoSize: true
  }
}

/** The lead series 1.2pt in py-beacon, the rest 0.88pt: 2px and 1px on screen. */
function widthOf(index: number): LineWidth {
  return index === 0 ? 2 : 1
}

/**
 * Per-series options every line in the app shares.
 *
 * The lead series heavier than the rest, as py-beacon draws it (1.2pt
 * against 0.88pt). The last value is labelled at the line's end by the
 * chart, not on the axis.
 */
export function lineOptions(mode: ThemeMode, index: number) {
  return {
    color: seriesColor(mode, index),
    lineWidth: widthOf(index),
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 3
  }
}

/** Volume and drawdown both render as a histogram under the main pane. */
export function histogramOptions(mode: ThemeMode, tone: 'muted' | 'negative' = 'muted') {
  return {
    color:
      tone === 'negative'
        ? COLORS[mode].danger
        : (PALETTE[mode][UNSIGNED] ?? COLORS[mode]['text-muted']),
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat: { type: 'volume' as const }
  }
}
