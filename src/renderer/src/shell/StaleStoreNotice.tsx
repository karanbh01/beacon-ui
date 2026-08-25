import { useState, type ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { useRegenerate } from '../views/coverage/useRegenerate'
import './StaleStoreNotice.css'

export interface StaleStoreNoticeProps {
  /**
   * Why the store is behind, in the engine's words. Absent means there is
   * nothing to say — including for every store this app did not generate.
   */
  reason?: string | undefined
}

/**
 * An offer to replace a synthetic store this app has outgrown (BU-89).
 *
 * The generation guard never touches an existing store, which is right — a
 * demo store written over someone's real data would be unforgivable — and the
 * cost of that rule is a machine that keeps whatever it generated the first
 * time, forever, with nothing on screen saying so. Two real cases: a store
 * made before BN-128 has no REGION or COUNTRY columns, so the universe
 * builder shows four filters instead of seven and looks unimplemented; one
 * made before the `--assets` fix holds 512 names, so every count in the app
 * is an order of magnitude out.
 *
 * An offer, never a rebuild. Regenerating costs a couple of minutes with no
 * data, so it is the user's call — and dismissing it has to stick for the
 * session, or the notice becomes something to fight rather than to read.
 */
export function StaleStoreNotice({ reason }: StaleStoreNoticeProps): ReactElement | null {
  // Keyed by reason rather than a boolean: a store that goes stale for a new
  // reason is worth saying again, and the same one is not.
  const [dismissed, setDismissed] = useState<string | undefined>(undefined)
  const regenerate = useRegenerate()

  if (reason === undefined || reason === dismissed) return null

  return (
    <aside className="stale-store" aria-label="Data store is out of date">
      <p className="stale-store-head type-13">This data is older than the app</p>
      <p className="stale-store-body type-11">
        The store was {reason}. Replacing it takes a couple of minutes, during which there is no
        data — your universes, indices and watchlists are kept.
      </p>

      {regenerate.problem !== undefined && (
        <p className="stale-store-problem type-11">{regenerate.problem}</p>
      )}

      <div className="stale-store-actions">
        <Button
          variant="accent"
          disabled={regenerate.busy}
          onClick={() => {
            void regenerate.run()
          }}
        >
          {regenerate.busy ? 'Replacing…' : 'Replace data…'}
        </Button>
        <Button
          disabled={regenerate.busy}
          onClick={() => {
            setDismissed(reason)
          }}
        >
          Not now
        </Button>
      </div>
    </aside>
  )
}
