import type { ReactElement } from 'react'
import { Button } from '../Button/Button'

export interface BackButtonProps {
  /** Where it goes, as the reader knows it: "All universes". */
  to: string
  onClick: () => void
}

/**
 * Back to a view's list, from one item opened out of it (BU-230).
 *
 * The list pickers ("All universes" among the options) were the only way
 * back, which Karan found missing: a way out should look like one.
 */
export function BackButton({ to, onClick }: BackButtonProps): ReactElement {
  return (
    <Button onClick={onClick} aria-label={`Back to ${to.toLowerCase()}`}>
      ‹ {to}
    </Button>
  )
}
