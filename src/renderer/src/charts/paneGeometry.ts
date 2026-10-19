// Where a chart's stacked panes sit, and the room kept at the top of each.
import type { IChartApi } from 'lightweight-charts'

/** A pane's place in the chart's host, in px from its top. */
export interface PaneBox {
  top: number
  height: number
}

/** The space between stacked panels (Karan, 2026-10-19). */
export const PANE_GAP = 10

/** Room at a lower pane's top for its title, above its data. */
const TITLE_BAND = 14

/**
 * Where each pane sits, read off the panes themselves rather than worked out
 * from their stretch factors, so it stays right after the reader drags a
 * pane taller.
 */
export function measurePanes(chart: IChartApi, host: HTMLElement): PaneBox[] {
  const origin = host.getBoundingClientRect().top
  return chart.panes().flatMap((pane) => {
    const element = pane.getHTMLElement()
    if (element === null) return []
    const box = element.getBoundingClientRect()
    return [{ top: box.top - origin, height: box.height }]
  })
}

/**
 * Keeps each lower pane's data clear of the gap and its title: a top
 * margin of that many px, as a share of the pane's height, which is the
 * unit the price scale takes.
 */
export function fitPaneMargins(chart: IChartApi, boxes: readonly PaneBox[]): void {
  chart.panes().forEach((pane, index) => {
    const box = boxes[index]
    if (index === 0 || box === undefined || box.height <= 0) return
    const top = Math.min(0.5, (PANE_GAP + TITLE_BAND) / box.height)
    pane.priceScale('left').applyOptions({ scaleMargins: { top, bottom: 0.06 } })
  })
}
