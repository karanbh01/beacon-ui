import type { ReactElement } from 'react'

/**
 * Beside a Home section's title: shows the whole list in a pop-up (Karan).
 * A text glyph for now, as the tab's × is: the app's icons are exported from
 * Figma, and this one is still to be drawn there.
 */
export function ExpandButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="home-expand"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">⤢</span>
    </button>
  )
}
