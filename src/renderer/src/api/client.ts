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

  return {
    get,
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
      coverage: (signal) => get('/data/coverage', { ...(signal === undefined ? {} : { signal }) })
    },
    health: () => get('/health')
  }
}

export { ApiError, NetworkError }
