import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
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

/**
 * A wait long enough that "loading" stops being informative (BU-191).
 *
 * Resolving a pipeline over a large universe is genuinely slow — every
 * name priced point-in-time, per rule — and a spinner that says the same
 * thing at four seconds and four minutes leaves a reader unable to tell
 * work from a hang. The elapsed count is the difference: it moves, so the
 * app is alive, and it tells them how long they have been waiting.
 */
export function ViewWorking({ what, since }: { what: string; since: number }): ReactElement {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(tick)
    }
  }, [])

  const seconds = Math.max(0, Math.round((now - since) / 1000))
  return (
    <p className="view-state type-11">
      Resolving {what}… {seconds}s
      {seconds >= 30 && ' · a large universe takes a while; every name is priced at the date'}
    </p>
  )
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

  if (error instanceof ApiError && error.code === 'CALCULATION_ERROR') {
    /*
     * A refusal is not a failure to load (py-beacon #204).
     *
     * The engine reached the data, understood it, and declined to publish a
     * number it cannot stand behind — a missing FX pair, before #204, showed
     * as a 50% overnight loss with no market move. "Could not load" reads as
     * a hiccup and invites a retry that will fail identically; the message
     * beneath already says which pair to load, so the heading has only to
     * stop pointing the reader at the wrong remedy.
     */
    return (
      <div className="view-state">
        <p className="type-13">The engine refused to answer.</p>
        <p className="type-11">{error.message}</p>
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
