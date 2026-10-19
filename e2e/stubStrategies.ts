/**
 * Stored strategies, as py-beacon 0.9.0 keeps them (BN-312, BN-313).
 *
 * The shapes were read off a running 0.9.0 engine, not from its docs: the
 * document as saved fills every field of the strategy in, and a listed one
 * carries a `problem` when its index is gone. Kept apart from stubEngine.ts,
 * which is long enough already, and free of its state: the engine module
 * owns the list and passes in the indices that exist.
 */

export interface StubStrategy {
  id: string
  name: string
  description: string | null
  index_id: string
  strategy: Record<string, unknown>
  implementation: Record<string, unknown> | null
}

export interface StubFinding {
  path: string
  rule_id: null
  severity: 'error'
  code: string
  message: string
}

/** What the engine fills in when a document leaves a strategy field out. */
const SPEC_DEFAULTS = {
  type: 'index',
  replication: null,
  signal: null,
  construction: null,
  constraints: [],
  universe: null,
  screen: null,
  rebalancing: 'MONTHLY',
  lookback_days: null,
  minimum_observations: null
}

const KINDS = ['index', 'index_tracking', 'active']

/** The plain strategy on an index: hold it as defined. */
export function plainStrategy(indexId: string): StubStrategy {
  return {
    id: indexId,
    name: `${indexId} as defined`,
    description: null,
    index_id: indexId,
    strategy: { ...SPEC_DEFAULTS },
    implementation: null
  }
}

/**
 * An active strategy built against an index, which is its benchmark: what
 * the Overview shows a benchmark alone for (Karan, 2026-10-18).
 */
export function activeStrategy(id: string, indexId: string): StubStrategy {
  return {
    id,
    name: `${indexId} minimum variance`,
    description: null,
    index_id: indexId,
    strategy: {
      ...SPEC_DEFAULTS,
      type: 'active',
      construction: { type: 'MinimumVariance', params: {} }
    },
    implementation: null
  }
}

/** A field the request sent as text, or '' — what a missing id reads as. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A document as the engine stores it, every strategy field filled in. */
export function normalise(document: Record<string, unknown>): StubStrategy {
  const spec = isRecord(document.strategy) ? document.strategy : {}
  return {
    id: text(document.id),
    name: text(document.name),
    description: typeof document.description === 'string' ? document.description : null,
    index_id: text(document.index_id),
    strategy: { ...SPEC_DEFAULTS, ...spec },
    implementation: isRecord(document.implementation) ? document.implementation : null
  }
}

function finding(path: string, code: string, message: string): StubFinding {
  return { path, rule_id: null, severity: 'error', code, message }
}

/** The findings a save would be refused with, at the engine's paths. */
export function findings(document: StubStrategy, indexIds: readonly string[]): StubFinding[] {
  const out: StubFinding[] = []
  if (!indexIds.includes(document.index_id)) {
    out.push(
      finding(
        'index_id',
        'index_not_found',
        `Its index '${document.index_id}' is not stored. Point the strategy at another index, or restore that one.`
      )
    )
  }
  const kind = String(document.strategy.type)
  if (!KINDS.includes(kind)) {
    out.push(finding('strategy.type', 'unknown_type', `'${kind}' is not a kind of strategy.`))
  }
  if (kind === 'index_tracking' && !isRecord(document.strategy.replication)) {
    out.push(finding('strategy.replication', 'required', 'Index tracking needs a replication.'))
  }
  if (kind === 'active' && !isRecord(document.strategy.construction)) {
    out.push(
      finding('strategy.construction', 'required', 'An active strategy needs a construction.')
    )
  }
  return out
}

/** A strategy as listed: the document, and what is wrong with it if anything. */
export function storedRow(strategy: StubStrategy, indexIds: readonly string[]): unknown {
  return {
    ...strategy,
    problem: indexIds.includes(strategy.index_id)
      ? null
      : {
          code: 'INDEX_NOT_FOUND',
          message: `Its index '${strategy.index_id}' is not stored.`
        }
  }
}

/** The strategies holding an index, which stop it being deleted (409 IN_USE). */
export function usersOf(indexId: string, strategies: readonly StubStrategy[]): string[] {
  return strategies.filter((strategy) => strategy.index_id === indexId).map((s) => s.id)
}
