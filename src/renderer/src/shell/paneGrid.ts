import { LAYOUT_OPTIONS, SINGLE_PANE, type LayoutOption, type LayoutPane } from '../state/chrome'

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

export function layoutById(id: string): LayoutOption {
  // Falling back to single rather than throwing: a stored layout id from a
  // future version must not take the shell down on downgrade.
  return LAYOUT_OPTIONS.find((option) => option.id === id) ?? SINGLE_PANE
}

export function panesFor(layoutId: string): readonly LayoutPane[] {
  return layoutById(layoutId).panes
}
