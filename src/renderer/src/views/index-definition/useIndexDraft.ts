import { useCallback, useEffect } from 'react'
import { ApiError } from '../../api/errors'
import { isDocumentId } from '../../api/ids'
import { useTabState } from '../../state/tabMemory'
import { useWorkspace } from '../../state/tabs.store'
import { useIndex } from '../shared/strategyQueries'
import { blankIndex, isDirty, type IndexDocument } from './pipeline'

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
 * The draft is the tab's own state seeded from the query, kept while the
 * reader is on another tab (0.2.1), not the query's data mutated in place: editing the cache would make the "revert" button
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

  // Kept per tab and per index, so a draft survives a look at another tab
  // and a tab moved to another index starts that one from what is stored.
  const [draft, setDraft] = useTabState<IndexDocument | undefined>(
    tabId,
    `index-draft:${indexId}`,
    undefined
  )

  // GET /indices/{id} returns the document itself; only create and save wrap
  // it in a SavedIndex alongside their non-blocking findings.
  const saved = query.data

  /**
   * A 404 is not a failure here — it is a new index.
   *
   * A document tab opened for a name the engine does not hold becomes the
   * editor for creating it, which is what "define → preview → backtest on a
   * fresh index" needs. Every other error still surfaces.
   */
  const missing = query.error instanceof ApiError && query.error.isNotFound

  // Seed once per index. Re-seeding on every query result would discard the
  // user's edits the moment anything refetched; a kept draft is not reseeded.
  useEffect(() => {
    if (draft !== undefined) return
    if (saved === undefined && !missing) return
    setDraft(saved ?? blankIndex(indexId))
  }, [draft, saved, missing, indexId, setDraft])

  const dirty = draft !== undefined && isDirty(draft, saved)

  useEffect(() => {
    setDirty(tabId, dirty)
  }, [tabId, dirty, setDirty])

  const edit = useCallback(
    (change: (current: IndexDocument) => IndexDocument) => {
      setDraft((current) => (current === undefined ? current : change(current)))
    },
    [setDraft]
  )

  const revert = useCallback(() => {
    setDraft(saved)
  }, [saved, setDraft])

  const commit = useCallback(
    (document: IndexDocument) => {
      setDraft(document)
    },
    [setDraft]
  )

  return {
    draft,
    saved,
    dirty,
    // Matched to the query's own enablement: an id py-beacon cannot address
    // never fires, so reporting it as loading would spin forever.
    loading: query.isPending && isDocumentId(indexId),
    error: query.isError && !missing ? query.error : undefined,
    edit,
    revert,
    commit
  }
}
