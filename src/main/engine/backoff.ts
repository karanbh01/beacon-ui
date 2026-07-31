/**
 * Restart backoff for the python server.
 *
 * The first retry is deliberately near-immediate: BU-19's acceptance is that
 * a kill -9 recovers within 5s, and a conventional 1s-then-double schedule
 * spends most of that budget waiting. Later retries back off properly, so a
 * genuinely broken install does not respawn in a tight loop.
 */
export const RESTART_DELAYS_MS = [200, 1_000, 3_000, 10_000, 30_000] as const

/** Consecutive failures after which we stop trying and report `stopped`. */
export const MAX_RESTARTS = 6

export function restartDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RESTART_DELAYS_MS.length - 1)
  return RESTART_DELAYS_MS[index] ?? 30_000
}

export function shouldGiveUp(attempt: number): boolean {
  return attempt >= MAX_RESTARTS
}
