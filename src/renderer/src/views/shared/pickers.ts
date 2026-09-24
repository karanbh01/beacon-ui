import type { components } from '@shared/api.generated'
/**
 * What a picker says when its catalogue is not a list of choices (BU-181).
 *
 * A `Select` over a failed query renders exactly like a `Select` over an
 * empty one, so "No universes" gets shown to someone whose universes are
 * all still there and simply could not be read. That is the same mistake
 * BU-162, BU-169 and BU-180 each fixed one layer down: a fault reported as
 * an absence, which is true of the wrong thing and cannot be acted on.
 *
 * The trigger is not hypothetical. py-beacon's listings fail whole rather
 * than per row — one document the server cannot read 500s `/indices`,
 * `/universes` and `/optimise/constraint-sets` alike (their #187) — and a
 * required field added to a stored model makes every document fail at
 * once. The picker goes blank, and the reader is told they own nothing.
 */
export interface CatalogueState {
  isPending: boolean
  isError: boolean
}

/**
 * Placeholder for a picker whose options come from a catalogue.
 *
 * `empty` is the honest sentence for a catalogue that loaded and holds
 * nothing — "No universes", "No indices" — and is reached only when that
 * is actually true.
 */
export function cataloguePlaceholder(state: CatalogueState, empty: string): string {
  if (state.isPending) return 'Loading…'
  if (state.isError) return 'Catalogue unavailable'
  return empty
}

/**
 * Whether a picker has anything to offer.
 *
 * Disabled in all three of loading, failed and empty — there is nothing to
 * choose in any of them — while the placeholder says which.
 */
export function catalogueDisabled(state: CatalogueState, count: number): boolean {
  return state.isPending || state.isError || count === 0
}

type SkippedCauses = components['schemas']['SkippedCauses']

/** What a tolerant listing reports about the documents it left out. */
export interface Skipped {
  skipped?: number | null
  /** Absent from an engine older than 0.1.0, which counted without saying why. */
  skipped_causes?: SkippedCauses | null
}

/**
 * Each cause, in the order a reader should act on them, with its remedy.
 *
 * The whole reason the causes are published separately (py-beacon #214) is
 * that the remedies are OPPOSITE. A document from a newer py-beacon is not
 * damaged — nothing is wrong with it, and upgrading the engine reads it —
 * while a damaged one needs restoring. "Could not be read" on its own sent
 * a reader to the second remedy when it was very often the first, which is
 * the ordinary state on two machines updated separately.
 */
const CAUSES: readonly (readonly [keyof SkippedCauses, string, string])[] = [
  ['from_newer_build', 'written by a newer py-beacon', 'upgrade the engine'],
  ['unrecognised', 'in a shape this engine does not accept', 'the server log names the field'],
  ['unparseable', 'damaged', 'restore or remove the file']
]

/**
 * That a listing left documents out (BU-185, BU-212).
 *
 * A short list is not an empty one: the rows that arrived are real choices
 * and the control stays usable, so this is a note beside it rather than a
 * placeholder inside it. py-beacon's listings skip a document they cannot
 * read and report the count (BN-174), which is the only way a client can
 * tell a complete list from an incomplete one — they are otherwise
 * identical, and that is the blank-picker lie moved one level out.
 *
 * Silence at zero. The common case is a complete listing, and a pane that
 * says "0 could not be read" is noise that trains a reader to stop looking.
 *
 * **Why, when the engine says why.** Before 0.1.0 the count was all there
 * was, and this said "could not be read" and named no cause, deliberately:
 * naming the likeliest would have been right most of the time and sent a
 * reader to the wrong remedy the rest. `skipped_causes` removes the guess.
 * An older engine still sends the bare count, so that sentence survives as
 * the fallback — reached only by an engine too old to say, which is the
 * one case it is still true for.
 */
export function describeSkipped(listing: Skipped | undefined): string | undefined {
  const skipped = listing?.skipped ?? 0
  if (skipped <= 0) return undefined

  const causes = listing?.skipped_causes
  if (causes == null) {
    // The pre-0.1.0 sentence, word for word: an engine this old cannot say
    // why, and naming the likeliest cause would be a guess.
    return skipped === 1
      ? '1 could not be read and is missing from this list'
      : `${String(skipped)} could not be read and are missing from this list`
  }

  const missing =
    skipped === 1 ? '1 is missing from this list' : `${String(skipped)} are missing from this list`
  const present = CAUSES.filter(([key]) => causes[key] > 0)

  // One cause needs no second count: "1 is missing: 1 damaged" says it twice.
  const [only] = present
  if (present.length === 1 && only !== undefined) {
    const [, what, remedy] = only
    return `${missing} — ${what} (${remedy})`
  }

  const parts = present.map(([key, what, remedy]) => `${String(causes[key])} ${what} (${remedy})`)
  return `${missing}: ${parts.join(', ')}`
}
