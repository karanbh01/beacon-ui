import { useCallback, useEffect, useMemo } from 'react'
import type { components } from '@shared/api.generated'
import { ApiError } from '../../api/errors'
import { useTabState } from '../../state/tabMemory'
import { useWorkspace } from '../../state/tabs.store'
import {
  useStrategy,
  type StoredStrategy,
  type StrategyDocument
} from '../shared/strategyDocuments'

export type TypedSpec = components['schemas']['TypedSpec']
export type StrategySpec = components['schemas']['StrategySpec']
export type ImplementationSpec = components['schemas']['ImplementationSpec']

/** The three kinds the engine runs, in the order a reader meets them. */
export const KINDS = [
  { value: 'index', label: 'The index as defined' },
  { value: 'index_tracking', label: 'Tracking the index' },
  { value: 'active', label: 'Active against the index' }
] as const

/*
 * The engine's defaults, which the generated types make required: a field
 * with a default is always present in what the engine returns, and the
 * types are generated from that side.
 */
const PLAIN: StrategySpec = { type: 'index', rebalancing: 'MONTHLY' }
const NO_IMPLEMENTATION: ImplementationSpec = {
  cash_buffer: 0,
  invest_flows: 'target',
  redistribution: 'pro_rata'
}

/** A new strategy: the plain kind, holding nothing yet. */
export function blankStrategy(id: string): StrategyDocument {
  return { id, name: '', index_id: '', strategy: PLAIN }
}

/**
 * The document as the engine stores it, minus what reading added.
 *
 * `GET /strategies/{id}` answers a StoredStrategy, which carries `problem`
 * on top of the document; saving that back would send a field the request
 * schema does not take.
 */
export function asDocument(stored: StoredStrategy): StrategyDocument {
  return {
    id: stored.id,
    name: stored.name,
    index_id: stored.index_id,
    ...(stored.description === undefined ? {} : { description: stored.description }),
    ...(stored.strategy === undefined ? {} : { strategy: stored.strategy }),
    ...(stored.implementation === undefined ? {} : { implementation: stored.implementation })
  }
}

/**
 * Changed from what was saved, read through the engine's defaults.
 *
 * A stored strategy comes back with every default filled (`constraints: []`,
 * `rebalancing: 'MONTHLY'`…) where a draft has them absent, so comparing
 * raw JSON would call a document nobody touched "unsaved".
 */
export function isDirty(draft: StrategyDocument, saved: StrategyDocument | undefined): boolean {
  if (saved === undefined) return true
  return JSON.stringify(normalised(draft)) !== JSON.stringify(normalised(saved))
}

function normalised(document: unknown): unknown {
  return JSON.parse(JSON.stringify(document), (_key, value: unknown) => {
    if (value === null) return undefined
    if (Array.isArray(value) && value.length === 0) return undefined
    return value
  }) as unknown
}

/** What this app can see is wrong before asking the engine. */
export function draftFindings(document: StrategyDocument): string[] {
  const findings: string[] = []
  if (document.name.trim() === '') findings.push('A strategy needs a name.')
  if (document.index_id === '') findings.push('Choose the index it holds.')
  const kind = document.strategy?.type ?? 'index'
  if (kind === 'index_tracking' && document.strategy?.replication == null) {
    findings.push('Tracking needs a replication: how the index is held.')
  }
  return findings
}

export interface StrategyDraft {
  draft: StrategyDocument | undefined
  saved: StrategyDocument | undefined
  dirty: boolean
  loading: boolean
  error: unknown
  edit: (change: (current: StrategyDocument) => StrategyDocument) => void
  revert: () => void
  commit: (document: StrategyDocument) => void
}

/**
 * The editable copy of a strategy, and the dirty flag its tab shows — the
 * same arrangement as an index's (`useIndexDraft`): tab state seeded once
 * from the query, a 404 read as a new strategy, dirty pushed to the tab.
 */
export function useStrategyDraft(tabId: string, strategyId: string): StrategyDraft {
  const query = useStrategy(strategyId)
  const setDirty = useWorkspace((state) => state.setDirty)

  // Kept per tab and per strategy, as an index's draft is (0.2.1).
  const [draft, setDraft] = useTabState<StrategyDocument | undefined>(
    tabId,
    `strategy-draft:${strategyId}`,
    undefined
  )

  const saved = useMemo(
    () => (query.data === undefined ? undefined : asDocument(query.data)),
    [query.data]
  )
  const missing = query.error instanceof ApiError && query.error.isNotFound

  useEffect(() => {
    if (draft !== undefined) return
    if (saved === undefined && !missing) return
    setDraft(saved ?? blankStrategy(strategyId))
  }, [draft, saved, missing, strategyId, setDraft])

  const dirty = draft !== undefined && isDirty(draft, saved)

  useEffect(() => {
    setDirty(tabId, dirty)
  }, [tabId, dirty, setDirty])

  const edit = useCallback(
    (change: (current: StrategyDocument) => StrategyDocument) => {
      setDraft((current) => (current === undefined ? current : change(current)))
    },
    [setDraft]
  )

  const revert = useCallback(() => {
    setDraft(saved)
  }, [saved, setDraft])

  const commit = useCallback(
    (document: StrategyDocument) => {
      setDraft(document)
    },
    [setDraft]
  )

  return {
    draft,
    saved,
    dirty,
    loading: strategyId !== '' && query.isPending && !missing,
    error: query.isError && !missing ? query.error : undefined,
    edit,
    revert,
    commit
  }
}

/** The strategy spec with a change, its type kept. */
export function withStrategy(
  document: StrategyDocument,
  patch: Partial<StrategySpec>
): StrategyDocument {
  return { ...document, strategy: { ...(document.strategy ?? PLAIN), ...patch } }
}

/** The implementation with a change; one emptied entirely goes back to none. */
export function withImplementation(
  document: StrategyDocument,
  patch: Partial<ImplementationSpec>
): StrategyDocument {
  const next: ImplementationSpec = { ...(document.implementation ?? NO_IMPLEMENTATION), ...patch }
  const empty = JSON.stringify(normalised(next)) === JSON.stringify(normalised(NO_IMPLEMENTATION))
  return { ...document, implementation: empty ? null : next }
}
