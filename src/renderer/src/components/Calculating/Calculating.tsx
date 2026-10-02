import type { ReactElement } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import './Calculating.css'

export interface CalculatingProps {
  /** What is being calculated, for a screen reader; not shown. */
  subject?: string
}

/**
 * The engine is working (BU-225).
 *
 * libraries.dev's `thinking-orbs`, in the `composing` state Karan picked: a
 * dotted sash rolling round a sphere. Drawn on a 2D canvas, so it costs a
 * frame loop and nothing more; and it follows the app's theme by itself,
 * through the `data-theme` attribute on the root, so it needs no tokens of
 * its own. The pill around it is the app's surface and border.
 *
 * A status, announced politely: the orb is decoration and is hidden from
 * assistive technology, which hears the word instead.
 */
export function Calculating({ subject }: CalculatingProps): ReactElement {
  return (
    <div className="calculating-host">
      <div
        className="calculating"
        role="status"
        aria-live="polite"
        aria-label={subject === undefined ? 'Calculating' : `Calculating ${subject}`}
      >
        <ThinkingOrb state="composing" size={64} aria-hidden="true" />
        <span className="calculating-label type-16">Calculating…</span>
      </div>
    </div>
  )
}
