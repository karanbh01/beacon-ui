import { useMutationState } from '@tanstack/react-query'
import { isTerminal } from './events'
import { useJobs } from './jobs'

/**
 * Background work, wherever it is running (BU-201).
 *
 * Two mechanisms answer to one footer item, because the difference between
 * them is ours and not the reader's. An engine JOB is pushed over the event
 * feed and survives the pane that started it; a long MUTATION — validate, a
 * preview — is an ordinary request that happens to take seconds. Karan asked
 * to see "a job running", and from outside there is no third thing.
 *
 * It replaces a per-pane elapsed counter. That counter could only speak for
 * the pane it sat in, so work started in one tab was invisible from every
 * other, and a preview left running while the reader moved on looked like
 * nothing was happening at all.
 */

/**
 * The prefix a mutation opts in under. Its second element is the label, so a
 * hook declares how it should read in the footer at the point where it knows.
 */
export const WORK_KEY = ['work'] as const

export function workKey(label: string): [string, string] {
  return ['work', label]
}

export interface BackgroundWork {
  /** What is running, in words, e.g. `['validating', 'previewing']`. */
  running: string[]
}

/** `MutationKey` is `readonly unknown[]`, so the label needs narrowing. */
function labelOf(key: readonly unknown[] | undefined): string {
  const label = key?.[1]
  return typeof label === 'string' ? label : 'working'
}

export function useBackgroundWork(): BackgroundWork {
  const mutations = useMutationState({
    filters: { mutationKey: WORK_KEY, status: 'pending' },
    select: (mutation) => labelOf(mutation.options.mutationKey)
  })
  const jobs = useJobs((state) => state.jobs)

  // Not memoised: the result is a handful of short strings rebuilt per
  // render, and a memo keyed on a freshly-built array would cost more to
  // explain than the work it saves.
  const running = [...mutations]
  for (const job of Object.values(jobs)) {
    if (!isTerminal(job.status)) running.push(job.kind)
  }
  return { running }
}
