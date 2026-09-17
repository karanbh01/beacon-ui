import type { components } from '@shared/api.generated'

export type CalendarCoverage = components['schemas']['CalendarCoveragePayload']

/**
 * The window a calendar could not cover (BN-198, BU-205).
 *
 * Null on an ordinary run, so its presence is the whole signal — and a book
 * built from a bare level series is always null, since there is no
 * calculation behind it to have narrowed anything.
 *
 * Karan's rule for py-beacon #211 was refuse if empty, report if partial.
 * This is the reporting half: the levels really do span `covered_*`, and a
 * chart drawn over them is correct and shorter than what was asked for, with
 * nothing on screen to say why. That silence is the fault the issue exists
 * to end, and it survives the fix unless a client renders this.
 */

/**
 * The two ends carry OPPOSITE remedies, which is why py-beacon publishes
 * them as separate flags rather than one `partial`.
 *
 * `trimmed_start` is a calendar whose history does not reach: the sessions
 * never existed, so the fix is a different calendar or a later base date.
 * `trimmed_end` is one whose published sessions stop: they do not exist YET,
 * so the fix is to wait or to ask for less. One sentence for both would give
 * the wrong advice half the time.
 */
function remedy(coverage: CalendarCoverage): string {
  if (coverage.trimmed_start && coverage.trimmed_end) {
    return `${coverage.calendar} neither reaches back that far nor publishes that far ahead — move the base date forward, and ask for an end it has sessions for`
  }
  if (coverage.trimmed_start) {
    return `${coverage.calendar} has no sessions that early — choose another calendar, or move the base date to ${coverage.covered_start}`
  }
  return `${coverage.calendar} has published no sessions that late — ask for an end on or before ${coverage.covered_end}, or wait for them`
}

export function describeNarrowing(
  coverage: CalendarCoverage | null | undefined
): string | undefined {
  if (coverage == null) return undefined
  if (!coverage.trimmed_start && !coverage.trimmed_end) return undefined

  return (
    `This run covers ${coverage.covered_start} → ${coverage.covered_end}, not the ` +
    `${coverage.requested_start} → ${coverage.requested_end} it asked for. ${remedy(coverage)}.`
  )
}
