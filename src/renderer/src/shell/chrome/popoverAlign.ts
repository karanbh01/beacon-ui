export type PopoverAlign = 'start' | 'end'

/**
 * Where the panel hangs relative to its trigger.
 *
 * `below` is the menu-bar idiom — the panel drops under the control it
 * belongs to. `beside` puts it alongside, which is what the tab strip's `+`
 * wants: the strip is 34px tall and sits at the very top of the pane, so a
 * panel dropping out of it lands on the pane header the user is reading.
 */
export type PopoverSide = 'below' | 'beside'

/** Keeps a flipped panel off the very edge of the window. */
const MARGIN = 8

export interface AnchorRect {
  left: number
  right: number
}

/** Where the panel's left edge lands for a given alignment. */
export function leftEdge(
  align: PopoverAlign,
  side: PopoverSide,
  anchor: AnchorRect,
  width: number
): number {
  if (side === 'beside') {
    return align === 'start' ? anchor.right : anchor.left - width
  }
  return align === 'start' ? anchor.left : anchor.right - width
}

/**
 * The alignment that actually fits.
 *
 * The `+` starts at the left of an empty tab strip and walks right as tabs
 * open, so a panel that always opened rightward eventually hangs off the
 * window. Which side has room is measured rather than guessed at a
 * breakpoint, because how far the button has travelled depends on how many
 * tabs are open and how wide their labels ran — nothing a media query knows.
 *
 * When neither side fits it stays where it was asked to go: swapping to a
 * side that also overflows trades one clipped edge for another.
 */
export function fittingAlign(
  align: PopoverAlign,
  side: PopoverSide,
  anchor: AnchorRect,
  width: number,
  viewportWidth: number
): PopoverAlign {
  const fits = (candidate: PopoverAlign): boolean => {
    const left = leftEdge(candidate, side, anchor, width)
    return left >= MARGIN && left + width <= viewportWidth - MARGIN
  }

  if (fits(align)) return align
  const other: PopoverAlign = align === 'start' ? 'end' : 'start'
  return fits(other) ? other : align
}
