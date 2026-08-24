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
 * py-beacon answers 200 for an upsert, 201 for something it created, 202 for
 * a job it accepted and 204 for a delete. Naming only 200 here would have
 * typed `sync` as `never` and made the job id unreachable — and 201 was
 * missing for the same reason until BN-132's `POST /universes` came back as
 * `never`, hiding the id the server had just derived from the name. A 204
 * resolves to `undefined`, which is what the caller actually receives;
 * `void` would let a caller pass the result on as if it carried something.
 */
type WriteResponse<M extends 'post' | 'put' | 'delete', P extends WritePath<M>> =
  WriteOp<M, P> extends { responses: infer R }
    ? R extends { 200: { content: { 'application/json': infer B } } }
      ? B
      : R extends { 201: { content: { 'application/json': infer B } } }
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
    /**
     * Reference for many identifiers in one call.
     *
     * `fields` is not an optimisation here — it is what makes `adv_3m`
     * reachable at all, since the endpoint returns stored columns by default
     * and derived ones only when asked for.
     */
    /**
     * Every feature the engine holds for one name (BN-140).
     *
     * `type` restricts to one feature dataset. Omitted searches all of them,
     * which the parameter's own note warns "picks arbitrarily" where two
     * datasets share a field name.
     */
    features: (
      identifier: string,
      date?: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/features/{identifier}'>>
    /** The feature datasets and their fields, for building columns. */
    featureCatalogue: (signal?: AbortSignal) => Promise<ResponseOf<'/data/features/catalogue'>>
    /** `date` is point-in-time: the engine returns only rows valid then. */
    referenceBatch: (
      identifiers: readonly string[],
      fields?: readonly string[],
      date?: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/reference'>>
    corporateActions: (
      identifier: string,
      query?: QueryOf<'/data/corporate-actions/{identifier}'>,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/corporate-actions/{identifier}'>>
    /**
     * Search, or enumerate when `q` is absent (BN-127).
     *
     * Ranking is the SERVER's: once `limit` is applied a client cannot
     * re-rank what it was not sent, so these come back in the order they are
     * to be shown.
     */
    identifiers: (
      query?: QueryOf<'/data/identifiers'>,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/data/identifiers'>>
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
    /**
     * Preview a DRAFT rather than what is saved.
     *
     * The id-only form can only describe the stored document, so the editor
     * had to say its resolved figures belonged to the last save. This takes
     * the document being edited.
     */
    previewDocument: (
      body: BodyOf<'post', '/indices/preview'>
    ) => Promise<WriteResponse<'post', '/indices/preview'>>
    /** The catalogue that makes a real methodology form possible (#43). */
    ruleTypes: (signal?: AbortSignal) => Promise<ResponseOf<'/indices/rule-types'>>
  }
  reports: {
    templates: (signal?: AbortSignal) => Promise<ResponseOf<'/reports/templates'>>
    template: (
      id: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/reports/templates/{template_id}'>>
    saveTemplate: (
      id: string,
      document: BodyOf<'put', '/reports/templates/{template_id}'>
    ) => Promise<WriteResponse<'put', '/reports/templates/{template_id}'>>
    render: (
      body: BodyOf<'post', '/reports/render'>
    ) => Promise<WriteResponse<'post', '/reports/render'>>
    /** The finished PDF, as bytes. Not JSON, so it bypasses `get`. */
    download: (renderId: string, signal?: AbortSignal) => Promise<Uint8Array>
  }
  universes: {
    list: (signal?: AbortSignal) => Promise<ResponseOf<'/universes'>>
    members: (
      id: string,
      signal?: AbortSignal
    ) => Promise<ResponseOf<'/universes/{universe_id}/members'>>
    /** BN-132. No id in the body — the server derives one from the name. */
    create: (body: BodyOf<'post', '/universes'>) => Promise<WriteResponse<'post', '/universes'>>
    update: (
      id: string,
      body: BodyOf<'put', '/universes/{universe_id}'>
    ) => Promise<WriteResponse<'put', '/universes/{universe_id}'>>
    remove: (id: string) => Promise<void>
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

  /**
   * Fetch a binary body.
   *
   * `get` parses JSON, and a PDF is not JSON. Kept as its own function rather
   * than a flag on `get` so no caller can accidentally ask for bytes and hand
   * them to something expecting a typed object.
   */
  async function downloadBytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        ...(signal === undefined ? {} : { signal })
      })
    } catch (cause) {
      throw new NetworkError('Could not reach the Beacon engine.', { cause })
    }

    if (!response.ok) throw await toApiError(response)
    return new Uint8Array(await response.arrayBuffer())
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
      features: (identifier, date, signal) =>
        get('/data/features/{identifier}', {
          params: { identifier },
          query: date === undefined || date === '' ? {} : { date },
          ...(signal === undefined ? {} : { signal })
        }),
      featureCatalogue: (signal) =>
        get('/data/features/catalogue', { ...(signal === undefined ? {} : { signal }) }),
      referenceBatch: (identifiers, fields, date, signal) =>
        get('/data/reference', {
          query: {
            identifiers: [...identifiers],
            ...(fields === undefined ? {} : { fields: [...fields] }),
            ...(date === undefined || date === '' ? {} : { date })
          },
          ...(signal === undefined ? {} : { signal })
        }),
      identifiers: (query, signal) =>
        get('/data/identifiers', {
          ...(query === undefined ? {} : { query }),
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
        }),
      previewDocument: (body) => write('post', '/indices/preview', { body }),
      ruleTypes: (signal) =>
        get('/indices/rule-types', { ...(signal === undefined ? {} : { signal }) })
    },
    reports: {
      templates: (signal) =>
        get('/reports/templates', { ...(signal === undefined ? {} : { signal }) }),
      template: (id, signal) =>
        get('/reports/templates/{template_id}', {
          params: { template_id: id },
          ...(signal === undefined ? {} : { signal })
        }),
      saveTemplate: (id, document) =>
        write('put', '/reports/templates/{template_id}', {
          params: { template_id: id },
          body: document
        }),
      render: (body) => write('post', '/reports/render', { body }),
      download: (renderId, signal) => downloadBytes(`/reports/renders/${renderId}`, signal)
    },
    universes: {
      list: (signal) => get('/universes', { ...(signal === undefined ? {} : { signal }) }),
      create: (body) => write('post', '/universes', { body }),
      update: (id, body) =>
        write('put', '/universes/{universe_id}', { params: { universe_id: id }, body }),
      remove: (id) => write('delete', '/universes/{universe_id}', { params: { universe_id: id } }),
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
