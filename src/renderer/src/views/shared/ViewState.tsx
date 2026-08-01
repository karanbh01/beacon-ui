import type { ReactElement, ReactNode } from 'react'
import { ApiError, NetworkError } from '../../api/errors'
import './ViewState.css'

/**
 * The loading / error / empty states every data view needs.
 *
 * Factored out after BU-22 because the interesting case is the same
 * everywhere: py-beacon's envelope carries a stable `code`, so the failure
 * certain to happen on a fresh install — a server started without a data
 * source — deserves one explanation written once, not one per view.
 */

export function ViewLoading({ what }: { what: string }): ReactElement {
  return <p className="view-state type-11">Loading {what}…</p>
}

export function ViewEmpty({ children }: { children: ReactNode }): ReactElement {
  return <p className="view-state type-11">{children}</p>
}

export function ViewError({ error }: { error: unknown }): ReactElement {
  if (error instanceof NetworkError) {
    return (
      <div className="view-state">
        <p className="type-13">The Beacon engine is not reachable.</p>
        <p className="type-11">Check the footer — it reports what the python process is doing.</p>
      </div>
    )
  }

  if (error instanceof ApiError && error.code === 'CONFIGURATION_ERROR') {
    return (
      <div className="view-state">
        <p className="type-13">This engine has no data source.</p>
        <p className="type-11">
          py-beacon is running, but <code>python -m beacon.server</code> was started without one, so
          no market data can be served. See issue #40.
        </p>
      </div>
    )
  }

  if (error instanceof ApiError && error.isNotFound) {
    return (
      <div className="view-state">
        <p className="type-13">Not found.</p>
        <p className="type-11">{error.message}</p>
      </div>
    )
  }

  if (error instanceof ApiError && error.isUnavailable) {
    // 503 means an optional py-beacon dependency is absent, e.g. scipy for
    // the optimiser. That is a setup problem, not a data problem.
    return (
      <div className="view-state">
        <p className="type-13">This feature is unavailable in the running engine.</p>
        <p className="type-11">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="view-state">
      <p className="type-13">Could not load.</p>
      <p className="type-11">{error instanceof Error ? error.message : 'Unknown error.'}</p>
    </div>
  )
}
