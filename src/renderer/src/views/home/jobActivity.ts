import { useJobs, type TrackedJob } from '@/api/jobs'
import { useActivityLog, type ActivityEntry, type ActivityStep } from '@/state/activityLog'
import { stepOf } from './jobSteps'

/** A backtest leads to its setup, its Overview and its holdings. */
export function backtestOpens(strategyId: string): NonNullable<ActivityEntry['opens']> {
  return [
    { label: 'Details', target: { viewKind: 'backtest', subject: strategyId } },
    { label: 'Overview', target: { viewKind: 'overview', subject: strategyId } },
    { label: 'Holdings', target: { viewKind: 'weights', subject: strategyId } }
  ]
}

/** What py-beacon names a job by, `backtest:TECH10`, in words; running and done differ. */
const TITLES: Record<string, (subject: string) => [running: string, done: string]> = {
  backtest: (id) => [`Backtest of ${id}`, `Backtest of ${id}`],
  optimise: () => ['Optimising', 'Optimisation'],
  generate: (id) => [`Generating store ${id}`, `Store ${id} generated`],
  load: (id) => [`Loading store ${id}`, `Store ${id} loaded`],
  refresh: (id) => [`Refreshing store ${id}`, `Store ${id} refreshed`],
  render: () => ['Rendering a report', 'Report rendered'],
  risk: (id) => [`Estimating risk model ${id}`, `Risk model ${id} estimated`]
}

export function titleOfJob(kind: string, running: boolean): string {
  const [name = '', subject = ''] = kind.split(':')
  const titles = TITLES[name]?.(subject)
  if (titles === undefined) return sentence(kind)
  return running ? titles[0] : titles[1]
}

/** Where a finished job leads, when it leads anywhere. */
export function opensOfJob(kind: string): ActivityEntry['opens'] {
  const [name, subject] = kind.split(':')
  if (name === 'backtest' && subject !== undefined) return backtestOpens(subject)
  return undefined
}

/** "7s", "1m 04s", "2h 05m": how long, as the timeline says it. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${String(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Running first, then newest first. */
export function inOrder(entries: readonly ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a, b) => {
    if ((a.status === 'running') !== (b.status === 'running')) {
      return a.status === 'running' ? -1 : 1
    }
    return b.at - a.at
  })
}

/**
 * The next state of a job's timeline entry, from the job as the engine last
 * described it (BU-287). Each new step its messages name is added, and the
 * step before it is timed as it ends; a settled job is timed whole and leads
 * where it can.
 */
export function followJob(
  previous: ActivityEntry | undefined,
  job: TrackedJob,
  now: number
): ActivityEntry {
  const running = job.settledAt === undefined
  const status = job.status === 'failed' ? 'failed' : running ? 'running' : 'done'
  const at = previous?.at ?? now
  const steps = nextSteps(previous?.steps ?? [], job, now, status)
  const opens = status === 'done' ? opensOfJob(job.kind) : undefined
  return {
    id: job.jobId,
    title: titleOfJob(job.kind, running),
    at,
    status,
    detail:
      status === 'running'
        ? `${String(Math.round(job.progress * 100))}%`
        : status === 'failed'
          ? 'Failed'
          : formatDuration((job.settledAt ?? now) - at),
    ...(steps.length === 0 ? {} : { steps }),
    ...(opens === undefined ? {} : { opens })
  }
}

function nextSteps(
  steps: readonly ActivityStep[],
  job: TrackedJob,
  now: number,
  status: ActivityEntry['status']
): ActivityStep[] {
  const out = [...steps]
  const last = out.at(-1)
  const ended = (step: ActivityStep): ActivityStep =>
    step.detail !== undefined || step.at === undefined
      ? step
      : { ...step, detail: formatDuration(now - step.at) }

  const step = stepOfJob(job)
  if (step !== undefined && step.label !== last?.label) {
    if (last !== undefined) out[out.length - 1] = ended(last)
    out.push({ ...step, at: now })
  }
  if (status === 'running') return out
  // Settled: the last step ends here, and a failure is its doing.
  const final = out.at(-1)
  if (final !== undefined) {
    out[out.length - 1] = { ...ended(final), ...(status === 'failed' ? { failed: true } : {}) }
  }
  return out
}

/** The step a job's last message names; a failure is told in the engine's own words. */
function stepOfJob(job: TrackedJob): Omit<ActivityStep, 'at'> | undefined {
  if (job.status === 'failed' && job.error !== undefined) return { label: job.error.message }
  const subject = job.kind.split(':')[1] ?? ''
  const step = stepOf(job.message, subject)
  return step === undefined ? undefined : { label: step.done, doing: step.doing }
}

/**
 * Keeps the activity log in step with the jobs the app is watching. Started
 * once by the app; returns the way to stop.
 */
export function startJobRecorder(): () => void {
  const sync = (jobs: Record<string, TrackedJob>): void => {
    const log = useActivityLog.getState()
    for (const job of Object.values(jobs)) {
      const previous = log.entries.find((entry) => entry.id === job.jobId)
      // A job settled before this session's log heard of it is not news.
      if (previous === undefined && job.settledAt !== undefined && job.status !== 'failed') {
        if (Date.now() - job.settledAt > 60_000) continue
      }
      const next = followJob(previous, job, Date.now())
      if (!sameEntry(previous, next)) log.record(next)
    }
  }
  sync(useJobs.getState().jobs)
  return useJobs.subscribe((state, before) => {
    if (state.jobs !== before.jobs) sync(state.jobs)
  })
}

function sameEntry(a: ActivityEntry | undefined, b: ActivityEntry): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b)
}

function sentence(kind: string): string {
  const words = kind.replace(/[:_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
