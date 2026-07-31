import { create } from 'zustand'
import { isTerminal, type JobEvent, type JobStatus } from './events'

export interface TrackedJob {
  jobId: string
  kind: string
  status: JobStatus
  progress: number
  message: string
  error?: string
  /** When it reached a terminal state, for auto-dismiss. */
  settledAt?: number
}

export interface JobsStore {
  jobs: Record<string, TrackedJob>
  apply: (event: JobEvent) => void
  dismiss: (jobId: string) => void
  clearSettled: (olderThanMs: number, now?: number) => void
  reset: () => void
}

/**
 * In-flight jobs, driven entirely by the event feed.
 *
 * Deliberately NOT in the query cache. A job is a transient process, not a
 * cached resource — it has no key to refetch, its updates are pushed rather
 * than polled, and treating it as query data would mean inventing a stale
 * time for something that is never stale, only finished.
 */
export const useJobs = create<JobsStore>()((set) => ({
  jobs: {},

  apply: (event) => {
    set((state) => {
      const existing = state.jobs[event.job_id]
      const settled = isTerminal(event.status)

      // Events can arrive out of order under load. Progress never goes
      // backwards, so a late frame cannot rewind a bar the user is watching.
      const progress =
        existing === undefined ? event.progress : Math.max(existing.progress, event.progress)

      const job: TrackedJob = {
        jobId: event.job_id,
        kind: event.kind,
        status: event.status,
        // A succeeded job is complete by definition, whatever the last
        // progress frame happened to say.
        progress: event.status === 'succeeded' ? 1 : progress,
        message: event.message ?? existing?.message ?? '',
        ...(event.error != null ? { error: event.error } : {}),
        ...(settled ? { settledAt: Date.now() } : {})
      }

      return { jobs: { ...state.jobs, [event.job_id]: job } }
    })
  },

  dismiss: (jobId) => {
    set((state) => ({
      jobs: Object.fromEntries(Object.entries(state.jobs).filter(([id]) => id !== jobId))
    }))
  },

  /** Drop finished jobs after a while so the tray does not accumulate. */
  clearSettled: (olderThanMs, now = Date.now()) => {
    set((state) => {
      const kept = Object.entries(state.jobs).filter(([, job]) => {
        if (job.settledAt === undefined) return true
        return now - job.settledAt < olderThanMs
      })
      return { jobs: Object.fromEntries(kept) }
    })
  },

  reset: () => {
    set({ jobs: {} })
  }
}))

/** Jobs still running, oldest first — what a progress affordance shows. */
export function activeJobs(jobs: Record<string, TrackedJob>): TrackedJob[] {
  return Object.values(jobs).filter((job) => !isTerminal(job.status))
}

/** Jobs that failed and have not been dismissed — these need attention. */
export function failedJobs(jobs: Record<string, TrackedJob>): TrackedJob[] {
  return Object.values(jobs).filter((job) => job.status === 'failed')
}
