import type { ReactElement } from 'react'
import type { ViewProps } from './viewRegistry'

/**
 * A saved tab for a view this release leaves out (BU-209).
 *
 * A workspace saved in `pnpm dev` can hold one, and the release must not
 * crash on it or draw an empty pane. Not MissingView: "nothing registered"
 * would be false — the view exists and is withheld — and only one of the
 * two is a statement a user can do anything with.
 */
export function WithheldView({ tab }: ViewProps): ReactElement {
  return (
    <div className="pane-missing">
      <p className="type-13">{tab.title} is not in this release.</p>
      <p className="type-11">It is still being built, and will arrive in a later version.</p>
    </div>
  )
}
