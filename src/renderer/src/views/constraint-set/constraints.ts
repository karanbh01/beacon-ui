import type { ConstraintRow, ConstraintSet } from '../shared/optimiseQueries'

/**
 * A constraint's parameters as the sentence Figma shows.
 *
 * Unlike an index rule, the constraint's parameter NAMES come from
 * `/optimise/constraint-types`, so the order is the catalogue's and the text
 * is stable between renders rather than following object key order.
 */
export function describeConstraint(
  constraint: ConstraintRow,
  catalogue: Record<string, string[]> = {}
): string {
  const params = constraint.params ?? {}
  const names = catalogue[constraint.type] ?? Object.keys(params)
  const parts = names
    .filter((name) => params[name] !== undefined && params[name] !== null)
    .map((name) => `${name.replace(/_/g, ' ')} ${format(params[name])}`)

  return parts.length === 0 ? 'no parameters' : parts.join(' · ')
}

function format(value: unknown): string {
  if (typeof value === 'number') {
    // Bounds and turnover limits arrive as fractions; a bare 0.2 in a
    // constraint row reads as 0.2%, which is a hundred times wrong.
    return Math.abs(value) <= 1 && !Number.isInteger(value)
      ? `${(value * 100).toFixed(2).replace(/\.?0+$/, '')}%`
      : value.toLocaleString('en-US')
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return (value as unknown[]).map(format).join(', ')
  return String(value)
}

/*
 * The list operations work on the ROWS, not on the document holding them
 * (BU-170).
 *
 * A constraint set is one place they live and an optimised index's derivation
 * is another — py-beacon stores the same `ConstraintRow` in both, so the same
 * editing belongs to both. The set-shaped wrappers below keep the callers
 * that have a set from having to unwrap it.
 */
export function nextRowId(rows: readonly ConstraintRow[]): string {
  const taken = new Set(rows.map((row) => row.id))
  for (let n = 1; ; n++) {
    const candidate = `c${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
}

export function addRow(rows: readonly ConstraintRow[], type: string): ConstraintRow[] {
  return [...rows, { id: nextRowId(rows), type, params: {} }]
}

export function removeRowById(rows: readonly ConstraintRow[], id: string): ConstraintRow[] {
  return rows.filter((row) => row.id !== id)
}

export function replaceRow(
  rows: readonly ConstraintRow[],
  constraint: ConstraintRow
): ConstraintRow[] {
  return rows.map((row) => (row.id === constraint.id ? constraint : row))
}

/**
 * Move a constraint one place.
 *
 * Order does NOT change the feasible set — constraints are simultaneous, not
 * sequential like index rules. It is a display preference, and reordering is
 * offered only because a long set is easier to read grouped by intent.
 */
export function moveRow(
  rows: readonly ConstraintRow[],
  id: string,
  delta: -1 | 1
): readonly ConstraintRow[] {
  const from = rows.findIndex((row) => row.id === id)
  const to = from + delta
  // A refused move gives back what it was given, so a caller can tell that
  // nothing happened by identity rather than by comparing contents.
  if (from < 0 || to < 0 || to >= rows.length) return rows

  const moved = [...rows]
  const one = moved[from]
  const other = moved[to]
  if (one === undefined || other === undefined) return rows
  moved[from] = other
  moved[to] = one

  return moved
}

/* ── the same operations, for a caller holding a set ─────────────────────── */

export function nextConstraintId(set: ConstraintSet): string {
  return nextRowId(set.constraints ?? [])
}

function withConstraints(set: ConstraintSet, constraints: ConstraintRow[]): ConstraintSet {
  return { ...set, constraints }
}

export function addConstraint(set: ConstraintSet, type: string): ConstraintSet {
  return withConstraints(set, addRow(set.constraints ?? [], type))
}

export function removeConstraint(set: ConstraintSet, id: string): ConstraintSet {
  return withConstraints(set, removeRowById(set.constraints ?? [], id))
}

export function replaceConstraint(set: ConstraintSet, constraint: ConstraintRow): ConstraintSet {
  return withConstraints(set, replaceRow(set.constraints ?? [], constraint))
}

export function moveConstraint(set: ConstraintSet, id: string, delta: -1 | 1): ConstraintSet {
  const rows = set.constraints ?? []
  const moved = moveRow(rows, id, delta)
  return moved === rows ? set : withConstraints(set, [...moved])
}

export function isDirty(draft: ConstraintSet, saved: ConstraintSet | undefined): boolean {
  if (saved === undefined) return true
  return JSON.stringify(draft) !== JSON.stringify(saved)
}
