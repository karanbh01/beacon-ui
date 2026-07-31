import type { ReactElement } from 'react'
import { StatusPill } from '../components/Badge/Badge'
import { activeJobs, useJobs, type TrackedJob } from './jobs'
import './JobTray.css'

function percent(progress: number): string {
  return `${String(Math.round(progress * 100))}%`
}

function JobRow({ job, onDismiss }: { job: TrackedJob; onDismiss: () => void }): ReactElement {
  const failed = job.status === 'failed'
  return (
    <div className="job-row">
      <div className="job-head">
        <span className="job-kind">{job.kind}</span>
        <StatusPill status={failed ? 'failed' : job.status === 'succeeded' ? 'done' : 'running'}>
          {failed ? 'failed' : job.status === 'succeeded' ? 'done' : percent(job.progress)}
        </StatusPill>
        <button
          type="button"
          className="job-dismiss"
          aria-label={`Dismiss ${job.kind}`}
          onClick={onDismiss}
        >
          &times;
        </button>
      </div>

      {/*
        Determinate bar only. py-beacon reports a real fraction, so an
        indeterminate shimmer would throw away information the server went to
        the trouble of sending.
      */}
      <div
        className="job-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress * 100)}
        aria-label={job.kind}
      >
        <div
          className={failed ? 'job-fill job-fill-failed' : 'job-fill'}
          style={{ width: percent(job.progress) }}
        />
      </div>

      <p className="job-message">{job.error ?? job.message}</p>
    </div>
  )
}

/**
 * Inline progress for running jobs, plus failures until dismissed.
 *
 * Successes disappear on their own: the result has already landed in the
 * pane, so a lingering "done" is one more thing to close. A failure stays,
 * because nothing else in the UI will tell you the work did not happen.
 */
export function JobTray(): ReactElement | null {
  const jobs = useJobs((state) => state.jobs)
  const dismiss = useJobs((state) => state.dismiss)

  const running = activeJobs(jobs)
  const failed = Object.values(jobs).filter((job) => job.status === 'failed')
  const shown = [...running, ...failed]

  if (shown.length === 0) return null

  return (
    <aside className="job-tray" aria-label="Background jobs">
      {shown.map((job) => (
        <JobRow
          key={job.jobId}
          job={job}
          onDismiss={() => {
            dismiss(job.jobId)
          }}
        />
      ))}
    </aside>
  )
}
