import type { paths } from '@shared/api.generated'
import { GENERATED_AGAINST } from '@shared/apiVersion'
import { ApiError, NetworkError, toApiError } from './errors'

/** Paths that support GET, narrowed from the generated spec. */
type GetPath = {
  [P in keyof paths]: paths[P] extends { get: unknown } ? P : never
}[keyof paths]

type GetOp<P extends GetPath> = paths[P] extends { get: infer G } ? G : never

type QueryOf<P extends GetPath> = GetOp<P> extends { parameters: { query?: infer Q } } ? Q : never

type PathParamsOf<P extends GetPath> =
  GetOp<P> extends { parameters: { path: infer T } } ? T : never

type ResponseOf<P extends GetPath> =
  GetOp<P> extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never

/** Paths supporting a write verb, narrowed the same way GET is. */
type WritePath<M extends 'post' | 'put' | 'delete'> = {
  [P in keyof paths]: paths[P] extends Record<M, unknown> ? P : never
}[keyof paths]

type WriteOp<M extends 'post' | 'put' | 'delete', P extends WritePath<M>> =
  paths[P] extends Record<M, infer O> ? O : never

type WritePathParams<M extends 'post' | 'put' | 'delete', P extends WritePath<M>> =
  WriteOp<M, P> extends { parameters: { path: infer T } } ? T : never

type BodyOf<M extends 'post' | 'put' | 'delete', P extends WritePath<M>> =
  WriteOp<M, P> extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never

/**
 * A write's success body, whichever 2xx it returns.
 *
 * py-beacon answers 200 for an upsert, 202 for a job it accepted and 204 for
 * a delete. Naming only 200 here would have typed `sync` as `never` and made
 * the job id unreachable. A 204 resolves to `undefined`, which is what the
 * caller actually receives — `void` would let a caller pass the result on as
 * if it carried something.
 */
type WriteResponse<M extends 'post' | 'put' | 'delete', P extends WritePath<M>> =
  WriteOp<M, P> extends { responses: infer R }
    ? R extends { 200: { content: { 'application/json': infer B } } }
      ? B
      : R extends { 202: { content: { 'application/json': infer B } } }
        ? B
        : undefined
    : undefined

export interface ClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
  /** py-beacon version reported by /health, for the mismatch warning. */
  serverVersion?: string
}

/**
 * Render a parameter value.
 *
 * Only primitives are valid in a URL. An object here means a caller passed
 * the wrong shape, and silently sending `[object Object]` would produce a
 * request that fails for a reason nothing explains.
 */
function toParam(value: unknown, key: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new TypeError(`Parameter "${key}" must be a string, number or boolean.`)
}

/** Fill `{placeholders}` in a path template. */
function expand(template: string, params: Record<string, unknown> | undefined): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined) throw new Error(`Missing path parameter "${key}" for ${template}`)
    return encodeURIComponent(toParam(value, key))
  })
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (query === undefined) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    // Repeated key rather than comma-joined: FastAPI parses list query
    // parameters that way, and `columns=a,b` would arrive as one string.
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) search.append(key, toParam(item, key))
    } else {
      search.append(key, toParam(value, key))
    }
  }
  const rendered = search.toString()
  return rendered === '' ? '' : `?${rendered}`
}

let warnedVersion = false

/**
 * Warn once when the server is a different py-beacon than the client's types
 * were generated against.
 *
 * Dev only, and console only. In a packaged build the two ship together so a
 * mismatch cannot happen, and telling a user about it would be noise they
 * cannot act on. Locally it is the single most likely cause of a call that
 * type-checks and still fails.
 */
function checkVersion(serverVersion: string | undefined): void {
  if (warnedVersion || serverVersion === undefined) return
  if (serverVersion === GENERATED_AGAINST) return
  warnedVersion = true
  if (import.meta.env.DEV) {
    console.warn(
      `[api] client types were generated against py-beacon ${GENERATED_AGAINST}, ` +
        `but the server reports ${serverVersion}. Run: pnpm run spec:refresh`
    )
  }
}

export interface BeaconClient {
  /** Typed GET against any path in the spec. */
  get: <P extends GetPath>(
    path: P,
    options?: {
      params?: PathParamsOf<P>
      query?: QueryOf<P>
      signal?: AbortSignal
    }
  ) => Promise<ResponseOf<P>>
  /** Typed write against any path in the spec. */
  write: <M extends 'post' | 'put' | 'delete', P extends WritePath<M>>(
    method: M,
    path: P,
    options?: {
      params?: WritePathParams<M, P>
      body?: BodyOf<M, P>
      signal?: AbortSignal
    }
  ) => Promise<WriteResponse<M, P>>
  data: {
    prices: (
      identifier: string,
      query?: QueryOf<'/data/prices/{identifier}'>,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/prices/{identifier}'>>
    reference: (
      identifier: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/reference/{identifier}'>>
    corporateActions: (
      identifier: string,
      query?: QueryOf<'/data/corporate-actions/{identifier}'>,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/corporate-actions/{identifier}'>>
    coverage: (signal?: AbortSignal) => Promise<ResponseOf<'/data/coverage'>>
    watchlists: (signal?: AbortSignal) => Promise<ResponseOf<'/data/watchlists'>>
    putWatchlist: (
      id: string,
      body: BodyOf<'put', '/data/watchlists/{watchlist_id}'>
    ) => Promise<WriteResponse<'put', '/data/watchlists/{watchlist_id}'>>
    deleteWatchlist: (id: string) => Promise<void>
    /** Accepted, not done: returns the job to follow on the event feed. */
    sync: (
      dataset: string,
      body?: BodyOf<'post', '/data/coverage/{dataset}/sync'>
    ) => Promise<WriteResponse<'post', '/data/coverage/{dataset}/sync'>>
  }
  indices: {
    list: (signal?: AbortSignal) => Promise<ResponseOf<'/indices'>>
    get: (id: string, signal?: AbortSignal) => Promise<ResponseOf<'/indices/{index_id}'>>
    create: (document: BodyOf<'post', '/indices'>) => Promise<WriteResponse<'post', '/indices'>>
    save: (
      id: string,
      document: BodyOf<'put', '/indices/{index_id}'>
    ) => Promise<WriteResponse<'put', '/indices/{index_id}'>>
    validate: (
      document: BodyOf<'post', '/indices/validate'>
    ) => Promise<WriteResponse<'post', '/indices/validate'>>
    preview: (
      id: string,
      body?: BodyOf<'post', '/indices/{index_id}/preview'>
    ) => Promise<WriteResponse<'post', '/indices/{index_id}/preview'>>
  }
  universes: {
    list: (signal?: AbortSignal) => Promise<ResponseOf<'/universes'>>
    members: (
      id: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/universes/{universe_id}/members'>>
  }
  health: () => Promise<ResponseOf<'/health'>>
}

/**
 * A thin typed wrapper over fetch.
 *
 * Every path, query parameter and response body is checked against the
 * generated spec, so a rename in py-beacon becomes a compile error here
 * rather than an undefined at runtime.
 */
export function createClient(options: ClientOptions): BeaconClient {
  const { baseUrl, token, fetchImpl = fetch, serverVersion } = options
  const base = baseUrl.replace(/\/$/, '')
  checkVersion(serverVersion)

  async function get<P extends GetPath>(
    path: P,
    request: {
      params?: PathParamsOf<P>
      query?: QueryOf<P>
      signal?: AbortSignal
    } = {}
  ): Promise<ResponseOf<P>> {
    const url = `${base}${expand(
      path,
      request.params as Record<string, unknown> | undefined
    )}${queryString(request.query as Record<string, unknown> | undefined)}`

    let response: Response
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
    } catch (cause) {
      // A dead engine is the common case here, and it must not surface as a
      // generic TypeError from fetch.
      throw new NetworkError('Could not reach the Beacon engine.', { cause })
    }

    if (!response.ok) throw await toApiError(response)

    return (await response.json()) as ResponseOf<P>
  }

  async function write<M extends 'post' | 'put' | 'delete', P extends WritePath<M>>(
    method: M,
    path: P,
    request: {
      params?: WritePathParams<M, P>
      body?: BodyOf<M, P>
      signal?: AbortSignal
    } = {}
  ): Promise<WriteResponse<M, P>> {
    const url = `${base}${expand(path, request.params as Record<string, unknown> | undefined)}`

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
    } catch (cause) {
      throw new NetworkError('Could not reach the Beacon engine.', { cause })
    }

    if (!response.ok) throw await toApiError(response)

    // 204 has no body, and calling .json() on it throws a parse error that
    // says nothing about the delete having actually succeeded.
    if (response.status === 204) return undefined as WriteResponse<M, P>

    return (await response.json()) as WriteResponse<M, P>
  }

  return {
    get,
    write,
    data: {
      prices: (identifier, query, signal) =>
        get('/data/prices/{identifier}', {
          params: { identifier },
          ...(query === undefined ? {} : { query }),
          ...(signal === undefined ? {} : { signal })
        }),
      reference: (identifier, signal) =>
        get('/data/reference/{identifier}', {
          params: { identifier },
          ...(signal === undefined ? {} : { signal })
        }),
      corporateActions: (identifier, query, signal) =>
        get('/data/corporate-actions/{identifier}', {
          params: { identifier },
          ...(query === undefined ? {} : { query }),
          ...(signal === undefined ? {} : { signal })
        }),
      coverage: (signal) => get('/data/coverage', { ...(signal === undefined ? {} : { signal }) }),
      watchlists: (signal) =>
        get('/data/watchlists', { ...(signal === undefined ? {} : { signal }) }),
      putWatchlist: (id, body) =>
        write('put', '/data/watchlists/{watchlist_id}', { params: { watchlist_id: id }, body }),
      deleteWatchlist: (id) =>
        write('delete', '/data/watchlists/{watchlist_id}', { params: { watchlist_id: id } }),
      sync: (dataset, body) =>
        write('post', '/data/coverage/{dataset}/sync', { params: { dataset }, body: body ?? {} })
    },
    indices: {
      list: (signal) => get('/indices', { ...(signal === undefined ? {} : { signal }) }),
      get: (id, signal) =>
        get('/indices/{index_id}', {
          params: { index_id: id },
          ...(signal === undefined ? {} : { signal })
        }),
      create: (document) => write('post', '/indices', { body: document }),
      save: (id, document) =>
        write('put', '/indices/{index_id}', { params: { index_id: id }, body: document }),
      validate: (document) => write('post', '/indices/validate', { body: document }),
      preview: (id, body) =>
        write('post', '/indices/{index_id}/preview', {
          params: { index_id: id },
          body: body ?? {}
        })
    },
    universes: {
      list: (signal) => get('/universes', { ...(signal === undefined ? {} : { signal }) }),
      members: (id, signal) =>
        get('/universes/{universe_id}/members', {
          params: { universe_id: id },
          ...(signal === undefined ? {} : { signal })
        })
    },
    health: () => get('/health')
  }
}

export { ApiError, NetworkError }
