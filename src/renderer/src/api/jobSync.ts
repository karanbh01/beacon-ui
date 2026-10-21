import { useEffect } from 'react'
import type { BeaconClient } from './client'
import { ApiError } from './errors'
import { isTerminal, type JobEvent, type JobStatus } from './events'
import { useJobs, type TrackedJob } from './jobs'

/** A running job unheard from for this long is asked about directly. */
export const QUIET_MS = 4_000
/** How often running jobs are checked for having gone quiet. */
export const CHECK_EVERY_MS = 3_000

type JobSnapshot = Awaited<ReturnType<BeaconClient['jobs']['get']>>

/** Running jobs whose last word is older than QUIET_MS. */
export function quietJobs(jobs: Readonly<Record<string, TrackedJob>>, now: number): TrackedJob[] {
  return Object.values(jobs).filter(
    (job) => !isTerminal(job.status) && now - job.heardAt >= QUIET_MS
  )
}

/** The engine's answer about a job, as the event it would have pushed. */
export function asEvent(snapshot: JobSnapshot): JobEvent {
  return {
    type: 'job',
    job_id: snapshot.job_id,
    kind: snapshot.kind,
    // The engine's own status words, read as the event parser reads them.
    status: snapshot.status as JobStatus,
    progress: snapshot.progress,
    message: snapshot.message,
    ...(snapshot.error == null ? {} : { error: snapshot.error })
  }
}

/**
 * Asks the engine about running jobs that have gone quiet (Karan, 0.2.1).
 *
 * The tray is driven by the event socket, and a socket that drops while a
 * job runs, as it can while the engine reads a large store, misses the frame
 * that says the job finished: the tray then sat on "Reading 'Synthetic data'"
 * at 92% long after the data was being served. Asking `GET /jobs/{id}` for
 * any job unheard from for a few seconds puts it right, however the frame
 * was lost. A job the engine no longer knows, after a restart, is closed as
 * failed rather than left running for ever.
 */
export function useJobSync(client: BeaconClient | null, onSucceeded: () => void): void {
  useEffect(() => {
    if (client === null) return undefined
    const timer = setInterval(() => {
      const { jobs, apply } = useJobs.getState()
      for (const job of quietJobs(jobs, Date.now())) {
        client.jobs
          .get(job.jobId)
          .then((snapshot) => {
            apply(asEvent(snapshot))
            if (snapshot.status === 'succeeded') onSucceeded()
          })
          .catch((error: unknown) => {
            if (!(error instanceof ApiError) || !error.isNotFound) return
            apply({
              type: 'job',
              job_id: job.jobId,
              kind: job.kind,
              status: 'failed',
              progress: job.progress,
              error: {
                code: 'UNCLASSIFIED_FAILURE',
                message: 'The engine no longer knows this job. It may have restarted.'
              }
            })
          })
      }
    }, CHECK_EVERY_MS)
    return () => {
      clearInterval(timer)
    }
  }, [client, onSucceeded])
}
