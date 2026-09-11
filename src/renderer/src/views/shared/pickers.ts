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

/**
 * That a listing left documents out (BU-185).
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
 */
export function describeSkipped(skipped: number | undefined): string | undefined {
  if (skipped === undefined || skipped <= 0) return undefined
  return skipped === 1
    ? '1 could not be read and is missing from this list'
    : `${String(skipped)} could not be read and are missing from this list`
}
