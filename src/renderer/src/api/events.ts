/**
 * The event feed py-beacon publishes on `/ws?token=…`.
 *
 * Two event types today, discriminated on `type`. Modelled as a union rather
 * than a loose record so an unknown type is a compile error at the switch,
 * not a silently ignored message.
 */

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/** The three states after which no further events arrive for a job. */
export const TERMINAL: readonly JobStatus[] = ['succeeded', 'failed', 'cancelled']

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.includes(status)
}

export interface JobEvent {
  type: 'job'
  job_id: string
  kind: string
  status: JobStatus
  /** 0.0 to 1.0, clamped server-side. */
  progress: number
  message?: string
  error?: string | null
  result?: unknown
}

export interface FreshnessEvent {
  type: 'data.freshness'
  dataset: string
  detail?: Record<string, unknown>
}

export type BeaconEvent = JobEvent | FreshnessEvent

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate a frame off the socket.
 *
 * The socket is loopback and the server is ours, but a malformed frame must
 * not take the renderer down — an unparseable event is dropped, not thrown.
 */
export function parseEvent(raw: unknown): BeaconEvent | undefined {
  if (!isRecord(raw)) return undefined

  if (raw.type === 'job') {
    if (typeof raw.job_id !== 'string' || typeof raw.status !== 'string') return undefined
    const progress = typeof raw.progress === 'number' ? raw.progress : 0
    return {
      type: 'job',
      job_id: raw.job_id,
      kind: typeof raw.kind === 'string' ? raw.kind : 'job',
      status: raw.status as JobStatus,
      // Clamp again on receipt. The server clamps, but a client that trusts
      // an out-of-range value renders a progress bar past its track.
      progress: Math.min(Math.max(progress, 0), 1),
      ...(typeof raw.message === 'string' ? { message: raw.message } : {}),
      ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
      ...(raw.result === undefined ? {} : { result: raw.result })
    }
  }

  if (raw.type === 'data.freshness') {
    if (typeof raw.dataset !== 'string') return undefined
    return {
      type: 'data.freshness',
      dataset: raw.dataset,
      ...(isRecord(raw.detail) ? { detail: raw.detail } : {})
    }
  }

  return undefined
}

/** Socket URL. The token is a query param — a WS handshake carries no headers. */
export function eventsUrl(baseUrl: string, token: string): string {
  const url = new URL('/ws', baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return url.toString()
}
