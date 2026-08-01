import type { ReactElement } from 'react'
import { Card } from '../components/Card/Card'
import { PaneHeader } from '../components/PaneHeader/PaneHeader'
import type { ViewProps } from '../shell/viewRegistry'
import './placeholders.css'

/**
 * The stand-in for a view that has not been built yet.
 *
 * Every earlier placeholder has been replaced by a live view; what remains is
 * this one shape, registered for the kinds still ahead of us. It says which
 * kind it is so a tab pointing at a typo'd viewKind is obvious.
 */
export function Pending({ viewKind, issue }: { viewKind: string; issue: string }): ReactElement {
  return (
    <Card title="Not built yet">
      <p className="type-11 view-note">
        <code>{viewKind}</code> is a placeholder. The real view arrives in {issue}.
      </p>
    </Card>
  )
}

export function GenericView({ tab }: ViewProps): ReactElement {
  return (
    <div className="view-stack">
      <PaneHeader kind="document" title={tab.title} meta={tab.viewKind} />
      <Pending viewKind={tab.viewKind} issue="a later milestone" />
    </div>
  )
}
