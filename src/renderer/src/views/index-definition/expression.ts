import type { components } from '@shared/api.generated'

export type ExpressionNode = components['schemas']['ExpressionNode']
export type FieldNode = components['schemas']['FieldNode']
export type ComparisonNode = components['schemas']['ComparisonNode']
export type Comparison = ComparisonNode['comparison']

/**
 * A screen, as rows rather than as a tree (BU-182).
 *
 * py-beacon's grammar is an arbitrary tree — comparisons composed with all,
 * any and not, nested to any depth (BN-188). Almost every screen anyone
 * writes is flatter than that: a handful of clauses, joined one way.
 *
 * So the editor works in rows, and this converts. What it will NOT do is
 * flatten a tree it cannot represent: a nested group survives being opened
 * and closed untouched, because silently rewriting somebody's screen into
 * the nearest thing this editor can draw would change what their index
 * selects without telling them.
 */
export interface Clause {
  id: string
  /** `reference.sector`, as `/data/fields` publishes it. */
  path: string
  comparison: Comparison
  value: unknown
  /** Wrapped in `not`, which the row draws as "is not". */
  negated: boolean
}

export interface Screen {
  combinator: 'all' | 'any'
  clauses: Clause[]
}

/** Every comparison py-beacon accepts, with how a row should say it. */
export const COMPARISONS: readonly { value: Comparison; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'ne', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'gt', label: 'is above' },
  { value: 'ge', label: 'is at least' },
  { value: 'lt', label: 'is below' },
  { value: 'le', label: 'is at most' },
  { value: 'between', label: 'is between' }
]

/** Comparisons whose value is a list rather than a scalar. */
export const MULTI: readonly Comparison[] = ['in', 'between']

export const EMPTY: Screen = { combinator: 'all', clauses: [] }

/** `reference.sector`, or `features.fundamentals.pe` where a dataset applies. */
export function pathOf(field: FieldNode): string {
  return [field.namespace, field.dataset, field.name].filter(Boolean).join('.')
}

/**
 * A path back into the field node the engine stores.
 *
 * Three parts means the middle one is a dataset — that is how py-beacon
 * builds the path, so it is how it comes apart.
 */
export function fieldFrom(path: string): FieldNode {
  const parts = path.split('.')
  if (parts.length >= 3) {
    return {
      node: 'field',
      namespace: parts[0] ?? '',
      dataset: parts.slice(1, -1).join('.'),
      name: parts[parts.length - 1] ?? ''
    }
  }
  return { node: 'field', namespace: parts[0] ?? '', name: parts[1] ?? '' }
}

/**
 * The stored tree as rows, or nothing if it is not row-shaped.
 *
 * Row-shaped means: one comparison, or one `all`/`any` whose operands are
 * each a comparison, optionally negated. Anything deeper is a real screen
 * this editor cannot draw, and saying so beats approximating it.
 */
export function readScreen(node: ExpressionNode | undefined): Screen | undefined {
  if (node === undefined) return EMPTY

  if (node.node === 'all' || node.node === 'any') {
    const clauses: Clause[] = []
    for (const [at, operand] of node.operands.entries()) {
      const clause = readClause(operand, at)
      if (clause === undefined) return undefined
      clauses.push(clause)
    }
    return { combinator: node.node, clauses }
  }

  const single = readClause(node, 0)
  return single === undefined ? undefined : { combinator: 'all', clauses: [single] }
}

function readClause(node: ExpressionNode, at: number): Clause | undefined {
  const negated = node.node === 'not'
  const inner = negated ? node.operand : node

  // A bare field is a valid node and not a clause: it has no comparison, so
  // there is no row to draw for it.
  if (inner.node !== 'comparison') return undefined

  return {
    id: `clause-${String(at)}`,
    path: pathOf(inner.field),
    comparison: inner.comparison,
    value: inner.value,
    negated
  }
}

/**
 * Rows back into a tree, or nothing when there are none.
 *
 * A single clause is written bare rather than wrapped in a one-operand
 * group: it is the same screen, it is what somebody writing Python would
 * produce, and it round-trips back to one row.
 */
export function writeScreen(screen: Screen): ExpressionNode | undefined {
  const operands = screen.clauses.map(writeClause)
  if (operands.length === 0) return undefined

  const only = operands[0]
  if (operands.length === 1 && only !== undefined) return only

  return { node: screen.combinator, operands }
}

function writeClause(clause: Clause): ExpressionNode {
  const comparison: ComparisonNode = {
    node: 'comparison',
    field: fieldFrom(clause.path),
    comparison: clause.comparison,
    value: clause.value
  }

  return clause.negated ? { node: 'not', operand: comparison } : comparison
}

/** A clause with nothing chosen yet, for the add slot. */
export function blankClause(path: string): Clause {
  return {
    id: `clause-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    path,
    comparison: 'eq',
    value: '',
    negated: false
  }
}

/**
 * What a rule row says about a screen, in words rather than JSON.
 *
 * Reads the TREE rather than the rows, so a screen this editor cannot edit
 * still describes itself in the methodology list — a rule a reader cannot
 * open should at least say what it does.
 */
export function describe(node: ExpressionNode | undefined): string {
  if (node === undefined) return 'no screen'

  switch (node.node) {
    case 'field':
      return pathOf(node)
    case 'comparison':
      return `${pathOf(node.field)} ${labelFor(node.comparison)} ${describeValue(node.value)}`
    case 'not':
      return `not ${describe(node.operand)}`
    case 'all':
      return node.operands.map(describe).join(' and ')
    case 'any':
      return node.operands.map(describe).join(' or ')
  }
}

function labelFor(comparison: Comparison): string {
  return COMPARISONS.find((entry) => entry.value === comparison)?.label ?? comparison
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ')
  return String(value)
}

/**
 * A value in the shape the comparison expects.
 *
 * `in` and `between` take a list and everything else a scalar, so switching
 * comparison has to carry the value across rather than leave a string where
 * the engine wants an array — which it would refuse, at save, with the row
 * looking perfectly filled in.
 */
export function coerceValue(value: unknown, comparison: Comparison): unknown {
  const multi = MULTI.includes(comparison)
  if (multi) return Array.isArray(value) ? value : listOf(value)
  return Array.isArray(value) ? (value[0] ?? '') : value
}

function listOf(value: unknown): unknown[] {
  if (value === '' || value === undefined || value === null) return []
  return [value]
}
