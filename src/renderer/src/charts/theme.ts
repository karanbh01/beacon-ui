import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type DeepPartial,
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

const FONT_UI = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/**
 * Series palette, in order.
 *
 * Three colours, because the design has three: accent is series 1, and
 * `series-2` / `series-3` exist for exactly this. A fourth compared asset
 * wraps rather than inventing a colour no token approves.
 */
export function seriesColors(mode: ThemeMode): string[] {
  return [COLORS[mode].accent, COLORS[mode]['series-2'], COLORS[mode]['series-3']]
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
 * Shared conventions, read off Figma 289:2846:
 *
 * - price scale on the LEFT, not the right
 * - horizontal gridlines only; vertical ones are not drawn in any frame
 * - crosshair follows the pointer freely rather than snapping to a bar
 * - no series price line; the last value is labelled on the axis instead
 *
 * They live here rather than per-chart so a second chart cannot quietly
 * disagree with the first about which side the axis is on.
 */
export function chartOptions(mode: ThemeMode): DeepPartial<ChartOptions> {
  const token = COLORS[mode]

  return {
    layout: {
      // `canvas`, not `surface` — surface is translucent, and a chart drawn
      // on it would blend with whatever happens to sit behind the pane.
      background: { type: ColorType.Solid, color: token.canvas },
      textColor: token['text-muted'],
      fontFamily: FONT_UI,
      fontSize: 11,
      attributionLogo: false,
      // The default separator is a hard slate line that reads as a border
      // from another app; the panes are one chart, so it takes `divider`.
      panes: {
        separatorColor: token.divider,
        separatorHoverColor: token['sidebar-active-bg'],
        enableResize: true
      }
    },
    grid: {
      horzLines: { color: token.divider, style: LineStyle.Solid },
      vertLines: { visible: false }
    },
    leftPriceScale: {
      visible: true,
      borderVisible: false,
      scaleMargins: { top: 0.12, bottom: 0.08 }
    },
    rightPriceScale: { visible: false },
    timeScale: {
      borderVisible: false,
      // The design labels months, not days, and fitting the whole range is
      // what a range control implies — the user picked the window already.
      fixLeftEdge: true,
      fixRightEdge: true
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: token['text-muted'],
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: token.accent
      },
      horzLine: {
        color: token['text-muted'],
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: token.accent
      }
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

/** Per-series options every line in the app shares. */
export function lineOptions(mode: ThemeMode, index: number) {
  return {
    color: seriesColor(mode, index),
    lineWidth: 1 as const,
    // The axis carries the last value (Figma 289:2866); a price line across
    // the plot would say the same thing twice and cross the other series.
    lastValueVisible: true,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 3
  }
}

/** Volume and drawdown both render as a histogram under the main pane. */
export function histogramOptions(mode: ThemeMode, tone: 'muted' | 'negative' = 'muted') {
  return {
    color: tone === 'negative' ? COLORS[mode].danger : COLORS[mode]['text-muted'],
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat: { type: 'volume' as const }
  }
}
