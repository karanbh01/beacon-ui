import {
  LAYOUT_OPTIONS,
  SINGLE_PANE,
  type LayoutOption,
  type LayoutPane,
  type SplitAxis
} from '../state/chrome'

/**
 * Turn the Layout Menu's glyph rectangles into a CSS grid (BU-55).
 *
 * The rectangles in `chrome.ts` are read off Figma 119:2 on a 24x24 grid, and
 * they stay the single source of truth for both the glyph and the layout.
 * What they are NOT is a set of real dimensions: the gap between them is
 * 2/24 of the width, which at a 1380px pane is 115px of nothing.
 *
 * So the rectangles are read for STRUCTURE — which column a pane starts in
 * and how many it spans — and the gutter is a fixed hairline in CSS. Every
 * arrangement in the menu happens to sit on a 2x2 grid, with full-width and
 * full-height panes spanning both tracks, so the mapping is exact rather
 * than approximate.
 */

export interface GridArea {
  gridColumn: string
  gridRow: string
}

/** Half-width and half-height in the glyph's units. */
const HALF = 12

export function gridAreaFor(pane: LayoutPane): GridArea {
  const column = pane.x < HALF ? 1 : 2
  const row = pane.y < HALF ? 1 : 2
  return {
    gridColumn: `${String(column)} / span ${pane.w > HALF ? '2' : '1'}`,
    gridRow: `${String(row)} / span ${pane.h > HALF ? '2' : '1'}`
  }
}

export interface Divider extends GridArea {
  axis: SplitAxis
}

/** Tracks a pane covers: both when it spans, otherwise the one it sits in. */
function tracksOf(start: number, size: number): number[] {
  if (size > HALF) return [1, 2]
  return [start < HALF ? 1 : 2]
}

function span(tracks: readonly number[]): string {
  const from = Math.min(...tracks)
  const to = Math.max(...tracks)
  return `${String(from)} / ${String(to + 1)}`
}

/**
 * The dividers a layout actually has, and how far they reach (BU-69).
 *
 * Read off the same rectangles as the panes, so a layout cannot grow a
 * divider that divides nothing. A vertical divider exists wherever a pane is
 * only half the width, and it spans exactly the rows where that is true —
 * `banner` splits its bottom row and not its full-width top, and the handle
 * has to stop where the split does.
 *
 * Both dividers move a single grid template, so dragging the one in
 * `main-stack` resizes the main pane against the whole stack, which is the
 * only reading that keeps the columns straight.
 */
export function dividersFor(panes: readonly LayoutPane[]): Divider[] {
  const dividers: Divider[] = []

  const splitRows = panes
    .filter((pane) => pane.w <= HALF)
    .flatMap((pane) => tracksOf(pane.y, pane.h))
  if (splitRows.length > 0) {
    dividers.push({ axis: 'x', gridColumn: '1', gridRow: span(splitRows) })
  }

  const splitCols = panes
    .filter((pane) => pane.h <= HALF)
    .flatMap((pane) => tracksOf(pane.x, pane.w))
  if (splitCols.length > 0) {
    dividers.push({ axis: 'y', gridColumn: span(splitCols), gridRow: '1' })
  }

  return dividers
}

export function layoutById(id: string): LayoutOption {
  // Falling back to single rather than throwing: a stored layout id from a
  // future version must not take the shell down on downgrade.
  return LAYOUT_OPTIONS.find((option) => option.id === id) ?? SINGLE_PANE
}

export function panesFor(layoutId: string): readonly LayoutPane[] {
  return layoutById(layoutId).panes
}

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * The pane beside `from` in a direction (BU-277), as the layout draws them:
 * one lying wholly that way and sharing some of its span across, the nearest
 * first, then the one most in line with it. Undefined at the edge — a move
 * with a direction does not wrap round to the far side.
 */
export function paneInDirection(
  panes: readonly LayoutPane[],
  from: number,
  direction: Direction
): number | undefined {
  const here = panes[from]
  if (here === undefined) return undefined
  const across = direction === 'left' || direction === 'right' ? spanY : spanX

  let best: { index: number; gap: number; offset: number } | undefined
  panes.forEach((pane, index) => {
    if (index === from || !overlaps(across(here), across(pane))) return
    const gap = gapTo(here, pane, direction)
    if (gap === undefined) return
    const offset = Math.abs(centre(across(here)) - centre(across(pane)))
    const nearer =
      best === undefined || gap < best.gap || (gap === best.gap && offset < best.offset)
    if (nearer) best = { index, gap, offset }
  })
  return best?.index
}

type Span = readonly [number, number]

const spanX = (pane: LayoutPane): Span => [pane.x, pane.x + pane.w]
const spanY = (pane: LayoutPane): Span => [pane.y, pane.y + pane.h]
const centre = ([start, end]: Span): number => (start + end) / 2
const overlaps = (a: Span, b: Span): boolean => a[0] < b[1] && b[0] < a[1]

/** How far `to` lies beyond `from` that way, or undefined when it does not. */
function gapTo(from: LayoutPane, to: LayoutPane, direction: Direction): number | undefined {
  const gap =
    direction === 'right'
      ? to.x - (from.x + from.w)
      : direction === 'left'
        ? from.x - (to.x + to.w)
        : direction === 'down'
          ? to.y - (from.y + from.h)
          : from.y - (to.y + to.h)
  return gap >= 0 ? gap : undefined
}
