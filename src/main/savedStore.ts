import type { EngineState } from '@shared/ipc'
import type { components } from '@shared/api.generated'
import { comparablePath, folderName } from '@shared/paths'
import { forgetSavedSettings, readSavedStorePath } from './dataSettings'

type DataStore = components['schemas']['DataStore']
type DataStoreCollection = components['schemas']['DataStoreCollection']

/** How handing a saved location to the engine went. */
export type Handover =
  /** Registered, or found already registered, and now being served. */
  | 'served'
  /** The engine says the folder holds no store; nothing to keep it for. */
  | 'not-a-store'
  /** Anything else. The saved location is kept, to be tried next launch. */
  | 'failed'

interface Connection {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}

/**
 * Give the engine a store location an older build saved (BU-215).
 *
 * Register the folder, or find it among the engine's stores if it is already
 * there, then serve it — so an upgrade opens on the same data it closed on.
 *
 * Only a definite answer lets the saved location go. A folder the engine says
 * is not a store never will be, so it is forgotten; a failure of any other
 * kind — a load already running, the engine going away mid-way — keeps it,
 * and every step is safe to repeat at the next launch.
 */
export async function handOverSavedStore(path: string, connection: Connection): Promise<Handover> {
  const doFetch = connection.fetchImpl ?? fetch
  const call = (route: string, init: RequestInit = {}): Promise<Response> =>
    doFetch(`${connection.baseUrl}${route}`, {
      ...init,
      headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }
    })

  const registered = await call('/data/stores', {
    method: 'POST',
    body: JSON.stringify({ kind: 'folder', name: folderName(path), path })
  })
  if (registered.status === 422) return 'not-a-store'

  const id = await storeIdOf(registered, path, call)
  if (id === undefined) return 'failed'

  const activated = await call(`/data/stores/${encodeURIComponent(id)}/activate`, {
    method: 'POST'
  })
  return activated.ok ? 'served' : 'failed'
}

/**
 * The id of the store at `path`: from a new registration, or — when the
 * engine answers 409 because it already has one — from its list.
 */
async function storeIdOf(
  registered: Response,
  path: string,
  call: (route: string) => Promise<Response>
): Promise<string | undefined> {
  if (registered.ok) return ((await registered.json()) as DataStore).id
  if (registered.status !== 409) return undefined

  const listed = await call('/data/stores')
  if (!listed.ok) return undefined
  const { stores } = (await listed.json()) as DataStoreCollection
  const wanted = comparablePath(path)
  return stores.find((store) => comparablePath(store.path) === wanted)?.id
}

/**
 * Hand over once, on the first connect of this launch.
 *
 * Not when `BEACON_DATA_PATH` is set: then the engine is serving what that
 * names, on purpose, and serving the saved store instead would overrule
 * whoever set it.
 */
export function handOverOnConnect(
  subscribe: (listener: (state: EngineState) => void) => void,
  log: (line: string) => void,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): void {
  const env = options.env ?? process.env
  let attempted = false

  subscribe((state) => {
    if (attempted || state.status !== 'connected') return
    if (state.baseUrl === undefined || state.token === undefined) return
    attempted = true

    const path = readSavedStorePath()
    if (path === '' || (env.BEACON_DATA_PATH ?? '').trim() !== '') return

    const connection = { baseUrl: state.baseUrl, token: state.token }
    void handOverSavedStore(path, {
      ...connection,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl })
    })
      .catch((): Handover => 'failed')
      .then((outcome) => {
        log(`saved data store ${path}: ${outcome}\n`)
        if (outcome !== 'failed') forgetSavedSettings()
      })
  })
}
