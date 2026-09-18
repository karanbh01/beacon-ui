import type { Fault } from '../views/shared/ViewState'

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
  error?: Fault
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
/**
 * An event we recognise and cannot read (BU-204).
 *
 * Distinct from one we do not recognise, which is dropped in silence on
 * purpose: a `type` this build has never heard of is py-beacon ahead of us,
 * and forward compatibility is the whole reason the parser is permissive.
 *
 * A KNOWN type with an unreadable payload is the opposite — a contract that
 * moved, or a fake that never implemented it. Dropped silently it produces a
 * job tray that simply never updates: no error, no failed request, nothing
 * to search for. py-beacon found the same shape in an `except Exception`
 * that had kept a broken test double alive for as long as it existed, and
 * the lesson generalises: a swallow that cannot tell those two apart will
 * eventually hide the second one.
 */
function unreadable(type: string, why: string): void {
  console.warn(`[beacon] dropped a ${type} event: ${why}`)
}

/**
 * A job's failure, as the envelope every other error uses (BN-199).
 *
 * It was a bare string until then, which is why the job path was the one
 * place a deliberate refusal and a crash reached the reader under the same
 * heading. It now carries the same `{code, message, detail}` a non-2xx
 * response does, so the same renderer handles both.
 *
 * A bare string is still accepted, because an older py-beacon sends one and
 * Karan updates the two repos separately. A message with no code reads as
 * an unclassified failure, which is exactly what it is.
 *
 * **Why this tolerance is safe, when the rule says most are not.** A
 * tolerance is dangerous when it can absorb a cause other than the one it
 * was built for — the second cause then being invisible precisely because
 * the tolerance is working. This one cannot: `JobStatus.error` is typed
 * `ErrorDetail | None`, so a current engine physically cannot emit a
 * string; py-beacon measured an un-migrated document and the route answers
 * 422 rather than passing one through. The only thing that can reach this
 * branch is an older engine, which is exactly and solely the case it exists
 * for. Delete it when the two repos can no longer be that far apart.
 */
function faultOf(raw: unknown): Fault | undefined {
  if (typeof raw === 'string') return { code: 'UNCLASSIFIED_FAILURE', message: raw }
  if (!isRecord(raw)) return undefined
  if (typeof raw.code !== 'string' || typeof raw.message !== 'string') return undefined

  return {
    code: raw.code,
    message: raw.message,
    ...(isRecord(raw.detail) ? { detail: raw.detail } : {})
  }
}

export function parseEvent(raw: unknown): BeaconEvent | undefined {
  if (!isRecord(raw)) return undefined

  if (raw.type === 'job') {
    if (typeof raw.job_id !== 'string') {
      unreadable('job', 'no job_id')
      return undefined
    }
    if (typeof raw.status !== 'string') {
      unreadable('job', 'no status')
      return undefined
    }
    const progress = typeof raw.progress === 'number' ? raw.progress : 0
    const fault = faultOf(raw.error)
    return {
      type: 'job',
      job_id: raw.job_id,
      kind: typeof raw.kind === 'string' ? raw.kind : 'job',
      status: raw.status as JobStatus,
      // Clamp again on receipt. The server clamps, but a client that trusts
      // an out-of-range value renders a progress bar past its track.
      progress: Math.min(Math.max(progress, 0), 1),
      ...(typeof raw.message === 'string' ? { message: raw.message } : {}),
      ...(fault === undefined ? {} : { error: fault }),
      ...(raw.result === undefined ? {} : { result: raw.result })
    }
  }

  if (raw.type === 'data.freshness') {
    if (typeof raw.dataset !== 'string') {
      unreadable('data.freshness', 'no dataset')
      return undefined
    }
    return {
      type: 'data.freshness',
      dataset: raw.dataset,
      ...(isRecord(raw.detail) ? { detail: raw.detail } : {})
    }
  }

  // An unknown type, which is py-beacon ahead of this build. Silent by
  // design: every new event kind they publish would otherwise warn.
  return undefined
}

/** Socket URL. The token is a query param — a WS handshake carries no headers. */
export function eventsUrl(baseUrl: string, token: string): string {
  const url = new URL('/ws', baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return url.toString()
}
