import type { PillStatus } from '@/components/Badge/Badge'
import type { TrackedJob } from '@/api/jobs'
import type { Activity } from './RecentActivity'

/** Longest list the frame draws, and about as much as stays scannable. */
const MAX_ROWS = 4

const STATUS: Record<string, PillStatus> = {
  succeeded: 'done',
  failed: 'failed',
  running: 'running',
  queued: 'running'
}

/** "2h ago", "yesterday" — the frame's phrasing, not a timestamp. */
export function relativeTime(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  if (hours < 48) return 'yesterday'
  return `${String(Math.floor(hours / 24))}d ago`
}

/**
 * Turn the job store into Recent Activity rows (Figma 73:185).
 *
 * Settled jobs are ordered newest first and running ones are put at the top
 * regardless, because something in flight is the thing you came to check.
 * A running row shows its percentage in the pill, exactly as `62%` does in
 * the frame; everything else shows its status word.
 */
export function activityRows(
  jobs: Record<string, TrackedJob>,
  now: number,
  max = MAX_ROWS
): Activity[] {
  const running: Activity[] = []
  const settled: { row: Activity; at: number }[] = []

  for (const job of Object.values(jobs)) {
    const status = STATUS[job.status] ?? 'info'
    const label = job.message === '' ? job.kind : job.message

    if (job.settledAt === undefined) {
      running.push({
        id: job.jobId,
        label,
        when: 'running',
        status: 'running',
        detail: `${String(Math.round(job.progress * 100))}%`
      })
      continue
    }
    settled.push({
      row: { id: job.jobId, label, when: relativeTime(job.settledAt, now), status },
      at: job.settledAt
    })
  }

  settled.sort((a, b) => b.at - a.at)
  return [...running, ...settled.map((entry) => entry.row)].slice(0, max)
}
