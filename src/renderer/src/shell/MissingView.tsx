import type { ReactElement } from 'react'
import type { ViewProps } from './viewRegistry'

/**
 * Shown when a tab names a viewKind nothing has registered.
 *
 * A blank pane would look like a rendering bug and send someone hunting in
 * the wrong place. Naming the missing kind points straight at the fix.
 */
export function MissingView({ tab }: ViewProps): ReactElement {
  return (
    <div className="pane-missing">
      <p className="type-13">No view registered for “{tab.viewKind}”</p>
      <p className="type-11">
        Register it with registerView(&apos;{tab.viewKind}&apos;, Component).
      </p>
    </div>
  )
}
