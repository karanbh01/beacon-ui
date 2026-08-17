/**
 * Turning what somebody typed into a member list (BU-78).
 *
 * Pasting a ticker list is the way anyone actually builds a universe — out of
 * a spreadsheet column, a comma-separated string, or a screener's output —
 * and every one of those arrives with different separators. Adding them one
 * at a time through the typeahead is the other way, and both end here.
 */

/** Every separator a pasted list plausibly arrives with. */
const SEPARATORS = /[\s,;|]+/

/**
 * Parse a pasted blob into identifiers.
 *
 * Upper-cased because py-beacon's identifiers are, and a list pasted from a
 * spreadsheet is as likely to be lower as not — rejecting it for case would
 * be pedantry about something the engine does not care about. Order is the
 * order it was pasted in, minus duplicates, because a universe list often
 * carries a meaning in its order even though membership does not.
 */
export function parseMembers(blob: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of blob.split(SEPARATORS)) {
    const identifier = raw.trim().toUpperCase()
    if (identifier === '' || seen.has(identifier)) continue
    seen.add(identifier)
    out.push(identifier)
  }
  return out
}

/** Add one, keeping the list unique and its order stable. */
export function addMember(members: readonly string[], identifier: string): string[] {
  const value = identifier.trim().toUpperCase()
  if (value === '' || members.includes(value)) return [...members]
  return [...members, value]
}

export function removeMember(members: readonly string[], identifier: string): string[] {
  return members.filter((member) => member !== identifier)
}

/**
 * A universe the engine seeded cannot be edited or deleted (BN-132).
 *
 * The field is `source`, and it is the ENGINE's answer rather than a guess
 * from the id — an earlier version of this would have keyed off the name
 * `GLOBAL`, which would break the moment a second seeded universe existed.
 */
export function isEditable(universe: { source?: string } | undefined): boolean {
  return universe !== undefined && universe.source !== 'seeded'
}

export interface DraftUniverse {
  name: string
  description: string
  members: string[]
}

export function blankUniverse(): DraftUniverse {
  return { name: '', description: '', members: [] }
}

/** What the engine will refuse, said before asking it. */
export function draftProblem(draft: DraftUniverse): string | undefined {
  if (draft.name.trim() === '') return 'A universe needs a name.'
  if (draft.name.trim().length > 64) return 'A name is at most 64 characters.'
  if (draft.members.length === 0) return 'A universe needs at least one member.'
  return undefined
}
