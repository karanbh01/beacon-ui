/**
 * py-beacon returns the same envelope for every non-2xx:
 *
 *   { "error": { "code": "...", "message": "...", "detail": {...} | null } }
 *
 * `code` is documented as stable and safe to branch on; `message` is for
 * humans. Mapping this once here means no view has to unwrap it, and no view
 * ends up showing a raw JSON blob to a user.
 */

export interface ErrorDetail {
  code: string
  message: string
  detail?: Record<string, unknown> | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: Record<string, unknown> | null

  constructor(status: number, body: ErrorDetail) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.detail = body.detail ?? null
  }

  /** Missing or invalid bearer token. */
  get isAuth(): boolean {
    return this.status === 401
  }

  /** The thing asked for does not exist — usually a bad identifier. */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** An optional py-beacon dependency is absent, e.g. scipy for the optimiser. */
  get isUnavailable(): boolean {
    return this.status === 503
  }
}

/** Raised when the server could not be reached at all. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

function isEnvelope(value: unknown): value is { error: ErrorDetail } {
  if (typeof value !== 'object' || value === null) return false
  const error = (value as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return false
  return typeof (error as ErrorDetail).code === 'string'
}

/**
 * Turn a failed response into an ApiError.
 *
 * Falls back to a synthetic envelope when the body is not one — a proxy or a
 * crash can return HTML, and throwing a parse error there would hide the real
 * status behind an unrelated failure.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  if (isEnvelope(body)) return new ApiError(response.status, body.error)

  return new ApiError(response.status, {
    code: `http_${String(response.status)}`,
    message:
      response.statusText === ''
        ? `Request failed (${String(response.status)})`
        : response.statusText
  })
}
