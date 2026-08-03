export type PopoverAlign = 'start' | 'end'

/** Keeps a flipped panel off the very edge of the window. */
const MARGIN = 8

/**
 * The alignment that actually fits.
 *
 * A tab strip's `+` starts at the left of the pane and walks right as tabs
 * open, so a menu that always opened rightward would eventually hang off the
 * window. Flipping is measured rather than guessed at a breakpoint, because
 * how far right the button has got depends on how many tabs are open and how
 * wide their labels ran.
 *
 * When neither side fits it stays where it was asked to go: swapping to a
 * side that also overflows trades one clipped edge for another.
 */
export function fittingAlign(
  align: PopoverAlign,
  rect: { left: number; right: number; width: number },
  viewportWidth: number
): PopoverAlign {
  if (align === 'start') {
    const overflows = rect.left + rect.width > viewportWidth - MARGIN
    return overflows && rect.right - rect.width > MARGIN ? 'end' : 'start'
  }
  const overflows = rect.right - rect.width < MARGIN
  return overflows && rect.left + rect.width < viewportWidth - MARGIN ? 'start' : 'end'
}
