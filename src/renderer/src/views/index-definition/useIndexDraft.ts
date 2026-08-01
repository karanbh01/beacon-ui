import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../state/tabs.store'
import { useIndex } from '../shared/strategyQueries'
import { isDirty, type IndexDocument } from './pipeline'

export interface IndexDraft {
  draft: IndexDocument | undefined
  saved: IndexDocument | undefined
  dirty: boolean
  loading: boolean
  error: unknown
  edit: (change: (current: IndexDocument) => IndexDocument) => void
  revert: () => void
  /** Called after a successful save, to make the draft the new baseline. */
  commit: (document: IndexDocument) => void
}

/**
 * The editable copy of an index, and the dirty flag the tab shows.
 *
 * The draft is local state seeded from the query, not the query's data
 * mutated in place: editing the cache would make the "revert" button
 * impossible and would leak a half-finished edit into any other view reading
 * the same key.
 *
 * Dirty is pushed to the workspace store because the TAB draws it (taxonomy
 * §1: only documents own dirty state), and the tab strip is nowhere near
 * this view.
 */
export function useIndexDraft(tabId: string, indexId: string): IndexDraft {
  const query = useIndex(indexId)
  const setDirty = useWorkspace((state) => state.setDirty)

  const [draft, setDraft] = useState<IndexDocument | undefined>(undefined)
  const seededFor = useRef<string | undefined>(undefined)

  // GET /indices/{id} returns the document itself; only create and save wrap
  // it in a SavedIndex alongside their non-blocking findings.
  const saved = query.data

  // Seed once per index. Re-seeding on every query result would discard the
  // user's edits the moment anything refetched.
  useEffect(() => {
    if (saved === undefined) return
    if (seededFor.current === indexId) return
    seededFor.current = indexId
    setDraft(saved)
  }, [saved, indexId])

  const dirty = draft !== undefined && isDirty(draft, saved)

  useEffect(() => {
    setDirty(tabId, dirty)
  }, [tabId, dirty, setDirty])

  const edit = useCallback((change: (current: IndexDocument) => IndexDocument) => {
    setDraft((current) => (current === undefined ? current : change(current)))
  }, [])

  const revert = useCallback(() => {
    setDraft(saved)
  }, [saved])

  const commit = useCallback((document: IndexDocument) => {
    setDraft(document)
  }, [])

  return {
    draft,
    saved,
    dirty,
    loading: query.isPending && indexId !== '',
    error: query.isError ? query.error : undefined,
    edit,
    revert,
    commit
  }
}
