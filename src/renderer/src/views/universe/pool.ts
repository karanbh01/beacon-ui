import { useMemo } from 'react'
import { useReferenceBatch } from '../shared/queries'
import { useUniverseMembers, useUniverses } from '../shared/strategyQueries'
import type { Candidate } from './builder'
import { fieldsByIdentifier } from './universe'

/**
 * The names a universe can be built from (BU-85).
 *
 * py-beacon has no "list every instrument in the dataset" endpoint, but it
 * seeds one universe — GLOBAL — from the loaded dataset at startup (BN-132),
 * and that IS the dataset. So the pool is the seeded universe's membership,
 * joined to its reference rows; the filters are then derived from whatever
 * columns those rows carry.
 *
 * `source === 'seeded'` rather than the name `GLOBAL`: the engine's own answer
 * for which universe it owns, and it stays right if a second one is ever
 * seeded.
 */
export interface CandidatePool {
  candidates: Candidate[]
  loading: boolean
  /** The universe the pool came from, for saying so on screen. */
  from: string | undefined
}

/**
 * @param active Fetch only while the builder is open. The pool is 500+ names
 *   and a reference batch, which is not worth pulling for a user who opened
 *   the view to read the table.
 */
export function useCandidatePool(active: boolean): CandidatePool {
  const universes = useUniverses()
  const seeded = universes.data?.universes.find((universe) => universe.source === 'seeded')

  // Both hooks below disable themselves on an empty argument, so gating the id
  // gates the whole chain — no `enabled` flag has to be threaded through.
  const poolId = active ? (seeded?.id ?? '') : ''
  const members = useUniverseMembers(poolId)
  const identifiers = useMemo(() => members.data?.identifiers ?? [], [members.data])
  const reference = useReferenceBatch(identifiers)

  const candidates = useMemo(() => {
    const byIdentifier = fieldsByIdentifier(reference.data?.entries ?? [])
    return identifiers.map((identifier) => ({
      identifier,
      fields: byIdentifier.get(identifier) ?? {}
    }))
  }, [identifiers, reference.data])

  const loading =
    active &&
    (universes.isPending ||
      (poolId !== '' && members.isPending) ||
      (identifiers.length > 0 && reference.isPending))

  return { candidates, loading, from: seeded?.name }
}
