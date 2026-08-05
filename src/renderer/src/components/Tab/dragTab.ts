/**
 * Dragging a tab between panes (BU-55).
 *
 * A private MIME type rather than `text/plain`, so a tab dropped into a text
 * field does not paste its id, and a file or a selection dragged onto a strip
 * is not mistaken for a tab. `dragover` can only ask WHETHER a type is
 * present, never read it, which is exactly why the type has to be specific
 * enough to decide on.
 */
export const TAB_MIME = 'application/x-beacon-tab'

/** True when this drag is carrying one of our tabs. */
export function carriesTab(types: readonly string[]): boolean {
  return types.includes(TAB_MIME)
}

/**
 * Where a drop at `x` would land, as an index among the strip's tabs.
 *
 * Measured against each tab's midpoint rather than its leading edge: the
 * halfway point is where the eye says the tab has been passed, and using an
 * edge makes the last position on the strip unreachable without overshooting
 * the strip itself.
 *
 * Tabs vary in width — a chip adds a subject, a dirty dot adds a few pixels —
 * so this cannot be `x / width`.
 */
export function dropIndexAt(rects: readonly DOMRect[], x: number): number {
  const passed = rects.findIndex((rect) => x < rect.left + rect.width / 2)
  return passed === -1 ? rects.length : passed
}

/**
 * Where to draw the marker for a drop at `index`, in the same coordinates as
 * the rects — the leading edge of the tab that would be pushed along, or the
 * trailing edge of the strip when the drop lands at the end.
 */
export function dropMarkerX(rects: readonly DOMRect[], index: number): number {
  const target = rects[index]
  if (target !== undefined) return target.left
  return rects[rects.length - 1]?.right ?? 0
}

export interface DropTarget {
  /** Position among the destination pane's tabs. */
  index: number
  /**
   * Viewport x for the strip marker, or absent when the pointer is over the
   * pane body — there is no gap between two tabs to point at down there.
   */
  markerX?: number
}

/**
 * Where a drop at (x, y) inside a pane would land (BU-70).
 *
 * The whole pane accepts a tab, not just its 16px strip: a drag that ends
 * over the view reads as a failed drop rather than a missed target. Over the
 * strip the position is meaningful and is measured; over the body there is
 * nothing to be between, so it appends.
 */
export function paneDropTarget(
  bar: DOMRect | undefined,
  tabs: readonly DOMRect[],
  x: number,
  y: number
): DropTarget {
  const overStrip = bar !== undefined && y >= bar.top && y <= bar.bottom
  if (!overStrip) return { index: tabs.length }

  const index = dropIndexAt(tabs, x)
  return { index, markerX: dropMarkerX(tabs, index) }
}
