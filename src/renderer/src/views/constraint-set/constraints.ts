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

export function nextConstraintId(set: ConstraintSet): string {
  const taken = new Set((set.constraints ?? []).map((row) => row.id))
  for (let n = 1; ; n++) {
    const candidate = `c${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
}

function withConstraints(set: ConstraintSet, constraints: ConstraintRow[]): ConstraintSet {
  return { ...set, constraints }
}

export function addConstraint(set: ConstraintSet, type: string): ConstraintSet {
  return withConstraints(set, [
    ...(set.constraints ?? []),
    { id: nextConstraintId(set), type, params: {} }
  ])
}

export function removeConstraint(set: ConstraintSet, id: string): ConstraintSet {
  return withConstraints(
    set,
    (set.constraints ?? []).filter((row) => row.id !== id)
  )
}

export function replaceConstraint(set: ConstraintSet, constraint: ConstraintRow): ConstraintSet {
  return withConstraints(
    set,
    (set.constraints ?? []).map((row) => (row.id === constraint.id ? constraint : row))
  )
}

/**
 * Move a constraint one place.
 *
 * Order does NOT change the feasible set — constraints are simultaneous, not
 * sequential like index rules. It is a display preference, and reordering is
 * offered only because a long set is easier to read grouped by intent.
 */
export function moveConstraint(set: ConstraintSet, id: string, delta: -1 | 1): ConstraintSet {
  const rows = [...(set.constraints ?? [])]
  const from = rows.findIndex((row) => row.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= rows.length) return set

  const moved = rows[from]
  const displaced = rows[to]
  if (moved === undefined || displaced === undefined) return set
  rows[from] = displaced
  rows[to] = moved

  return withConstraints(set, rows)
}

export function isDirty(draft: ConstraintSet, saved: ConstraintSet | undefined): boolean {
  if (saved === undefined) return true
  return JSON.stringify(draft) !== JSON.stringify(saved)
}
