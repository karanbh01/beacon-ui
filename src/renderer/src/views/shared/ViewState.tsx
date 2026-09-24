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

/**
 * A coded fault, wherever it arrived from (BU-207).
 *
 * The same `{code, message, detail}` envelope reaches this app two ways: on
 * a non-2xx response, and — since BN-199 — on a failed job. They were
 * rendered by two different paths, so a refusal and a crash looked alike on
 * a job while being carefully told apart over HTTP. One renderer, because
 * the distinction belongs to the error rather than to how it travelled.
 *
 * The message is always py-beacon's, verbatim. A paraphrase cannot name the
 * field to change, and the heading is the only part we are better placed to
 * write than they are.
 */
export interface Fault {
  code: string
  message: string
  detail?: Record<string, unknown> | null
}

/** One problem a refusal names, as the engine publishes it (`Finding`). */
interface FindingRow {
  path: string
  message: string
}

/**
 * The specifics of a refusal, when it carries them (BU-212).
 *
 * Since BN-221 one error class refuses an index pipeline, a universe, a
 * feature import and a constraint set, and it puts every problem in the
 * envelope's `detail.findings` rather than in the message. The message is
 * now "Invalid rule: constraint set. Reason: it has errors" — true, and no
 * help at all — so a renderer that shows only the message shows that
 * something is wrong and not what. The constraint editor used to print the
 * findings into the message, unparseably; they are structured now, and a
 * structure nothing reads is the absence this repo keeps filing.
 *
 * Read defensively because `detail` is `Record<string, unknown>`: an entry
 * that is not a finding is skipped rather than rendered as "undefined".
 */
function findingsOf(detail: Fault['detail']): FindingRow[] {
  const raw = detail?.findings
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { path, message } = entry as Record<string, unknown>
    if (typeof message !== 'string') return []
    return [{ path: typeof path === 'string' ? path : '', message }]
  })
}

function FindingList({ fault }: { fault: Fault }): ReactElement | null {
  const findings = findingsOf(fault.detail)
  if (findings.length === 0) return null
  return (
    <ul className="view-state-findings type-11">
      {findings.map((finding) => (
        <li key={`${finding.path}-${finding.message}`}>
          {finding.path !== '' && <code>{finding.path}</code>} {finding.message}
        </li>
      ))}
    </ul>
  )
}

export function FaultNotice({ fault }: { fault: Fault }): ReactElement {
  if (fault.code === 'INVALID_RULE') {
    /*
     * The input, as written, is what was refused (BU-212).
     *
     * One class refuses a pipeline, a universe, a feature import and a
     * constraint set since BN-221, and it names every problem in
     * `detail.findings`. "Could not load" over a list of what is wrong with
     * the reader's own document points at the engine when the remedy is in
     * the document — the heading-as-remedy lesson from BU-199 again.
     */
    return (
      <div className="view-state">
        <p className="type-13">The engine rejected this as written.</p>
        <p className="type-11">{fault.message}</p>
        <FindingList fault={fault} />
      </div>
    )
  }

  if (fault.code === 'CALCULATION_ERROR') {
    /*
     * A refusal is not a failure to load (py-beacon #204).
     *
     * The engine reached the data, understood it, and declined to publish a
     * number it cannot stand behind — a missing FX pair, before #204, showed
     * as a 50% overnight loss with no market move. "Could not load" reads as
     * a hiccup and invites a retry that will fail identically; the message
     * beneath already says which pair to load, so the heading has only to
     * stop pointing the reader at the wrong remedy.
     *
     * True of everything arriving under this code since BN-194. A crash
     * used to share it — `calculator.py` wraps the weighting call in a bare
     * `except Exception` — and was headed as a decision somebody made; the
     * branch below catches those now, under a code of their own.
     */
    return (
      <div className="view-state">
        <p className="type-13">The engine refused to answer.</p>
        <p className="type-11">{fault.message}</p>
        <FindingList fault={fault} />
      </div>
    )
  }

  if (fault.code === 'UNEXPECTED_CALCULATION_FAILURE') {
    /*
     * A fault, not a decision (BN-194, py-beacon #207).
     *
     * Nobody wrote a guard for this, so there is nothing in the request to
     * change and a reader told otherwise goes looking for it. `original_type`
     * names the exception class, which is the difference between "report
     * this" and "report this, it is a ZeroDivisionError".
     *
     * Kept apart from the refusal by the published CODE alone — never by the
     * `WeightingScheme-` prefix one `except` block puts in the calculation
     * name. py-beacon now has a test proving a refusal and a crash can carry
     * the same name, so that prefix is provably not a signal rather than
     * merely a bad thing to lean on.
     */
    const kind = typeof fault.detail?.original_type === 'string' ? fault.detail.original_type : null
    return (
      <div className="view-state">
        <p className="type-13">The engine broke on this calculation.</p>
        <p className="type-11">{fault.message}</p>
        {kind !== null && (
          <p className="type-11">Raised a {kind} — worth reporting with the date.</p>
        )}
      </div>
    )
  }

  /*
   * An unclassified failure, which BN-199 gives a code rather than a null
   * (`UNCLASSIFIED_FAILURE`, on jobs that failed before it existed), and
   * anything else we have no branch for. The generic wording is right for
   * both: we do not know whether it was decided or broken, and claiming
   * either would be worse than admitting neither.
   */
  return (
    <div className="view-state">
      <p className="type-13">Could not load.</p>
      <p className="type-11">{fault.message}</p>
      <FindingList fault={fault} />
    </div>
  )
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

  // Coded, but nothing above is about its STATUS — so it is the same fault
  // a job would carry, and gets the same renderer.
  if (error instanceof ApiError) return <FaultNotice fault={error} />

  return (
    <div className="view-state">
      <p className="type-13">Could not load.</p>
      <p className="type-11">{error instanceof Error ? error.message : 'Unknown error.'}</p>
    </div>
  )
}
