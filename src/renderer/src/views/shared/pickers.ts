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
