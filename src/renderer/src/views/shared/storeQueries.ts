import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { folderName } from '@shared/paths'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { workKey } from '../../api/work'

/**
 * Where data comes from, as the engine keeps it (BU-215, py-beacon 0.1.2).
 *
 * The engine owns the registry: which stores exist, which is served, and what
 * removing each one does. This replaces a model in which the app owned one
 * store path, generated data itself before starting the engine, and restarted
 * the engine to change either.
 */

export type DataStore = components['schemas']['DataStore']

export function useStores() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.data.stores(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.stores.list(signal)
    },
    enabled: client !== null
  })
}

/** Refetch the list after anything that changes it. */
function useRefreshStores(): () => void {
  const queries = useQueryClient()
  return () => {
    void queries.invalidateQueries({ queryKey: keys.data.stores() })
  }
}

/**
 * Generate synthetic data and serve it.
 *
 * Returns as soon as the engine accepts the job; the job's own events carry
 * the progress. A work key, so the footer names it while the request is in
 * flight, before the first job event arrives to take over.
 */
export function useGenerateData() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationKey: workKey('generating data'),
    mutationFn: () => {
      if (client === null) throw new Error('No engine')
      return client.data.generateSynthetic()
    },
    // The new store is registered at once, before it is written, so the list
    // can show it arriving rather than appearing only when it is done.
    onSuccess: refresh
  })
}

/**
 * Serve a different store: a `load:{id}` job.
 *
 * Every query derived from the old data goes stale when it finishes, and
 * BU-216 handles that off `data_version` — nothing here needs to.
 */
export function useActivateStore() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationKey: workKey('loading data'),
    mutationFn: (id: string) => {
      if (client === null) throw new Error('No engine')
      return client.stores.activate(id)
    },
    onSuccess: refresh
  })
}

export function useRenameStore() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      if (client === null) throw new Error('No engine')
      return client.stores.rename(id, { name })
    },
    onSuccess: refresh
  })
}

export function useRemoveStore() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationFn: (id: string) => {
      if (client === null) throw new Error('No engine')
      return client.stores.remove(id)
    },
    onSuccess: refresh
  })
}

/**
 * What a store is, in the words a reader chooses between.
 *
 * `source` records where the rows came from and `managed` whether the engine
 * made the folder. Together they say what removing it will do, which is the
 * distinction this label exists to carry: a generated or imported store is
 * the engine's and goes with its files; a folder is the user's and is only
 * forgotten.
 */
export function storeKind(store: DataStore): string {
  if (store.kind === 'postgres') return 'Database'
  if (store.source === 'synthetic') return 'Generated'
  if (store.source === 'imported') return 'Imported'
  return store.managed ? 'Engine store' : 'Your folder'
}

/** What Remove will do to this store, said before it is done. */
export function removalOf(store: DataStore): { deletesFiles: boolean; detail: string } {
  if (store.managed) {
    return {
      deletesFiles: true,
      detail:
        'The engine created this store, so its files are deleted with it. This cannot be undone.'
    }
  }
  // Never managed, so never deleted: a database is read-only to Beacon, and
  // "the folder is not touched" would be the wrong promise for one.
  if (store.kind === 'postgres') {
    return {
      deletesFiles: false,
      detail:
        'Beacon forgets this database. Nothing in it is changed, and it can be added again later.'
    }
  }
  return {
    deletesFiles: false,
    detail: `Beacon forgets this store. The folder at ${store.path} is not touched, and can be opened again later.`
  }
}

/**
 * Why a store cannot be read, in the terms of what it is (BN-241).
 *
 * A folder is unreadable because it moved or went away. A database is
 * unreadable for one reason only — the variable naming its password is not
 * set on the engine's machine, since listing never connects — and "moved or
 * deleted?" would send a reader looking for a folder that never existed.
 */
export function unreadableReason(store: DataStore): string {
  if (store.kind !== 'postgres') return 'cannot be read — moved or deleted?'
  const variable = store.connection?.password_env
  return variable == null
    ? 'no password variable is set for this database'
    : `the password variable ${variable} is not set on the engine’s machine`
}

/**
 * Register a folder that already holds a store, then serve it.
 *
 * "Open" means use it, so registration is followed by activation. A folder
 * already registered answers 409 and is shown as such rather than resolved
 * quietly: it is already in the list, with a Use button beside it.
 */
export function useOpenFolder() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationKey: workKey('opening a data folder'),
    mutationFn: async (path: string) => {
      if (client === null) throw new Error('No engine')
      // `refresh_from` is the engine's own default, sent because the generated
      // type cannot tell a defaulted field from a required one. Downloading
      // from Yahoo Finance is opt-in per store, and nothing here opts in.
      const store = await client.stores.register({
        kind: 'folder',
        name: folderName(path),
        path,
        refresh_from: 'source'
      })
      return client.stores.activate(store.id)
    },
    // Refetched on failure too: a refused activation leaves the folder
    // registered, and the list should show it.
    onSettled: refresh
  })
}

/**
 * Load CSV files or a workbook as a new store (BN-239).
 *
 * Every row is checked before anything is saved. A refusal is INVALID_RULE
 * with the rows as findings — capped at 200, with the true count beside them
 * (BU-214) — which the dialog lists.
 */
export function useImportFiles() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationKey: workKey('importing data'),
    mutationFn: (paths: string[]) => {
      if (client === null) throw new Error('No engine')
      return client.data.importFiles({ paths, name: 'Imported data', activate: true })
    },
    onSuccess: refresh
  })
}

/**
 * The store being served, from the engine's list — or undefined when nothing
 * is, or the list has not arrived.
 */
export function useServedStore(): DataStore | undefined {
  return useStores().data?.stores.find((store) => store.active)
}

/**
 * Whether Refresh can be offered for a store, and why not when it cannot
 * (BN-238, BN-240).
 *
 * The engine names the refresh a store supports, or null for none: imported
 * files are imported again rather than refreshed, and synthetic data made
 * before py-beacon 0.1.2 cannot be extended. A re-read is the one kind that
 * also depends on the moment — a store not being served is read fresh when
 * it is used, so re-reading it would change nothing, and the engine refuses.
 */
export function refreshOf(store: DataStore): { available: boolean; reason?: string } {
  if (store.refresh == null) return { available: false, reason: whyNoRefresh(store) }
  if (store.refresh === 'reread' && !store.active) {
    return { available: false, reason: 'it is read afresh when it is used' }
  }
  return { available: true }
}

/** The engine's reasons, in the dialog's words. */
function whyNoRefresh(store: DataStore): string {
  if (store.source === 'imported') return 'imported files are refreshed by importing them again'
  if (store.source === 'synthetic') return 'made before py-beacon 0.1.2 — generate new data instead'
  return 'it cannot be read'
}

/**
 * Refresh a store: a `refresh:{id}` job, answered 202.
 *
 * If the store is being served, the engine serves the refreshed data under a
 * new `data_version`, and BU-216 invalidates what was derived from the old.
 */
export function useRefreshStore() {
  const client = useBeacon()
  const refresh = useRefreshStores()

  return useMutation({
    mutationKey: workKey('refreshing data'),
    mutationFn: (id: string) => {
      if (client === null) throw new Error('No engine')
      return client.stores.refresh(id)
    },
    onSuccess: refresh
  })
}
