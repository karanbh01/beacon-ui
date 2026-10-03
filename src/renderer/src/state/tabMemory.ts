import { create } from 'zustand'

/**
 * What a tab was showing, kept while the reader is on another tab (BU-227).
 *
 * A pane draws only its active tab, so switching away unmounts the view and
 * any state it held in `useState` went with it: a preview run a moment ago
 * came back asking to be run, and Index Definition came back on its
 * catalogue rather than the definition that was open. Keyed by tab id, so
 * two tabs of one view keep their own.
 *
 * In memory only. A tab opened afresh — or after a restart — starts empty,
 * which is what Karan asked for: a new preview asks to be run.
 */

/** A constituent preview's date, and the date its shown result was run at. */
export interface PreviewMemory {
  /** The index this memory belongs to; a different one starts empty. */
  indexId: string
  asOf: string
  /** Set once a run succeeds; the result is cached under this date. */
  ran?: string
}

interface TabMemoryState {
  previews: Readonly<Record<string, PreviewMemory>>
  /** The definition Index Definition opened from its catalogue. */
  openedDefinitions: Readonly<Record<string, string>>
  rememberPreview: (tabId: string, memory: PreviewMemory) => void
  rememberOpenedDefinition: (tabId: string, indexId: string | undefined) => void
}

export const useTabMemory = create<TabMemoryState>((set) => ({
  previews: {},
  openedDefinitions: {},
  rememberPreview: (tabId, memory) => {
    set((state) => ({ previews: { ...state.previews, [tabId]: memory } }))
  },
  rememberOpenedDefinition: (tabId, indexId) => {
    set((state) => {
      const others = Object.fromEntries(
        Object.entries(state.openedDefinitions).filter(([id]) => id !== tabId)
      )
      return { openedDefinitions: indexId === undefined ? others : { ...others, [tabId]: indexId } }
    })
  }
}))

/** Forget every tab. A test seam: tabs reuse ids from one test to the next. */
export function forgetAllTabs(): void {
  useTabMemory.setState({ previews: {}, openedDefinitions: {} })
}

/** This tab's preview memory for `indexId`, or a fresh one if it was another. */
export function usePreviewMemory(
  tabId: string,
  indexId: string
): [PreviewMemory, (next: Omit<PreviewMemory, 'indexId'>) => void] {
  const stored = useTabMemory((state) => state.previews[tabId])
  const remember = useTabMemory((state) => state.rememberPreview)
  const memory = stored?.indexId === indexId ? stored : { indexId, asOf: '' }
  return [
    memory,
    (next) => {
      remember(tabId, { ...next, indexId })
    }
  ]
}

/** The definition this tab had open, and a way to change it. */
export function useOpenedDefinition(
  tabId: string
): [string | undefined, (indexId: string | undefined) => void] {
  const opened = useTabMemory((state) => state.openedDefinitions[tabId])
  const remember = useTabMemory((state) => state.rememberOpenedDefinition)
  return [
    opened,
    (indexId) => {
      remember(tabId, indexId)
    }
  ]
}
