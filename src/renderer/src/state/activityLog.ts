import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Where an activity leads: a view, and what to open it on. */
export interface ActivityTarget {
  viewKind: string
  subject?: string
}

/** One stage of an activity, drawn as a hollow dot under it. */
export interface ActivityStep {
  /** As logged, once done: "Simulated TECH10". */
  label: string
  /** While it is the step under way: "Simulating TECH10". */
  doing?: string
  /** "12s", or why it failed. */
  detail?: string
  failed?: boolean
  /** When it began, so its length is known when the next one starts. */
  at?: number
}

/** One thing that happened: a run, a save, a load (BU-287). */
export interface ActivityEntry {
  id: string
  title: string
  /** When it happened, or started. */
  at: number
  status: 'done' | 'running' | 'failed'
  /** On the right: how long it took, its progress, or "Failed". */
  detail?: string
  steps?: readonly ActivityStep[]
  /** Where it can be opened. None makes it a hollow dot that cannot be clicked. */
  opens?: readonly { label: string; target: ActivityTarget }[]
}

/** As much history as Home's timeline is worth scrolling through. */
const KEEP = 200

interface ActivityLogState {
  entries: ActivityEntry[]
  /** Add one, newest first, or replace the one with its id. */
  record: (entry: ActivityEntry) => void
}

/**
 * What this app has done (BU-287, Karan: "it's the activity of the app"),
 * for Home's timeline: each job it watched, with its steps as they came, and
 * each document it saved or deleted. Kept across restarts, the newest 200.
 */
export const useActivityLog = create<ActivityLogState>()(
  persist(
    (set) => ({
      entries: [],
      record: (entry) => {
        set((state) => {
          const others = state.entries.filter((known) => known.id !== entry.id)
          return { entries: [entry, ...others].sort((a, b) => b.at - a.at).slice(0, KEEP) }
        })
      }
    }),
    {
      name: 'beacon.activity',
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
      merge: (persisted, current) => ({ ...current, entries: settled(entriesOf(persisted)) })
    }
  )
)

export type DocumentKind = 'index' | 'strategy' | 'universe'

const DOCUMENTS: Record<
  DocumentKind,
  { name: string; opens: (id: string) => ActivityEntry['opens'] }
> = {
  index: {
    name: 'Index definition',
    opens: (id) => [
      { label: 'Definition', target: { viewKind: 'index-definition', subject: id } },
      { label: 'Constituent preview', target: { viewKind: 'constituent-preview', subject: id } }
    ]
  },
  strategy: {
    name: 'Strategy',
    opens: (id) => [{ label: 'Strategy', target: { viewKind: 'strategy', subject: id } }]
  },
  universe: {
    name: 'Universe',
    opens: (id) => [{ label: 'Universe', target: { viewKind: 'universe-set', subject: id } }]
  }
}

/** A document created, saved or deleted, as it happens; a deleted one leads nowhere. */
export function recordDocument(
  kind: DocumentKind,
  id: string,
  verb: 'created' | 'saved' | 'deleted',
  at = Date.now()
): void {
  const document = DOCUMENTS[kind]
  const opens = verb === 'deleted' ? undefined : document.opens(id)
  useActivityLog.getState().record({
    id: `${kind}:${id}:${verb}:${String(at)}`,
    title: `${document.name} ${id} ${verb}`,
    at,
    status: 'done',
    ...(opens === undefined ? {} : { opens })
  })
}

/**
 * A run the app was watching when it closed cannot be followed any more, so
 * it is not shown as still running for ever.
 */
function settled(entries: ActivityEntry[]): ActivityEntry[] {
  return entries.map((entry) =>
    entry.status === 'running' ? { ...entry, status: 'failed', detail: 'Unfinished' } : entry
  )
}

/** Stored entries read back, keeping only what has the shape of one. */
function entriesOf(persisted: unknown): ActivityEntry[] {
  const stored = (persisted as { entries?: unknown } | undefined)?.entries
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (entry): entry is ActivityEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as ActivityEntry).id === 'string' &&
      typeof (entry as ActivityEntry).title === 'string' &&
      typeof (entry as ActivityEntry).at === 'number'
  )
}
