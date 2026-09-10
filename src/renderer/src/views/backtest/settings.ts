import type { ConstraintRow } from '../shared/optimiseQueries'

/**
 * Everything the Backtest tab collects (BU-174).
 *
 * Numbers are kept as strings because they are INPUTS: a half-typed "1_0" is
 * a state the form has to hold, and parsing on every keystroke turns an empty
 * box into a zero. They become numbers once, on the way out.
 *
 * A blank date is not a missing value either — py-beacon defaults `start` to
 * the index base date and `end` to the last observation it has, which is a
 * better answer than any default this form could invent.
 */
export interface BacktestSettings {
  start: string
  end: string
  costBps: string
  initialCapital: string
  /** Index id to measure against, or '' for none. */
  benchmark: string
  /** Derive an optimised index from the subject, and back-test that. */
  optimise: boolean
  derivedId: string
  derivedName: string
  objective: string
  constraints: ConstraintRow[]
}

/**
 * py-beacon's own defaults, restated so the form shows what it will send.
 *
 * A blank capital box would send 1,000,000 anyway; showing the number is the
 * difference between a default and a surprise.
 */
export const DEFAULT_SETTINGS: BacktestSettings = {
  start: '',
  end: '',
  costBps: '5',
  initialCapital: '1000000',
  benchmark: '',
  optimise: false,
  derivedId: '',
  derivedName: '',
  objective: 'min_tracking_error',
  constraints: []
}

/**
 * What the solve minimises.
 *
 * py-beacon accepts one value today and publishes the accepted set in the
 * field's own description, so this list follows that sentence rather than a
 * schema enum. A Select with one option still says the choice exists and
 * names the one that was made.
 */
export const OBJECTIVES = ['min_tracking_error']

/** py-beacon's id pattern, from the path parameter it validates against. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * What stops this run, said here rather than fetched as a 422.
 *
 * Only what the form can know: a date order, a capital of zero, an id the
 * engine's pattern would reject. Whether the id is already taken is the
 * engine's to answer — it owns the catalogue — and a 409 says it better than
 * a stale copy of the list would.
 */
export function settingsFindings(settings: BacktestSettings, indexId: string): string[] {
  const findings: string[] = []

  if (indexId === '') findings.push('Choose an index to back-test.')
  if (settings.start !== '' && settings.end !== '' && settings.start > settings.end) {
    findings.push('Start is after end.')
  }

  const capital = Number(settings.initialCapital)
  if (settings.initialCapital === '' || !Number.isFinite(capital) || capital <= 0) {
    findings.push('Initial capital has to be more than zero.')
  }

  const cost = Number(settings.costBps)
  if (settings.costBps === '' || !Number.isFinite(cost) || cost < 0) {
    findings.push('Transaction cost cannot be negative.')
  }

  return settings.optimise ? findings.concat(optimiserFindings(settings, indexId)) : findings
}

function optimiserFindings(settings: BacktestSettings, indexId: string): string[] {
  const findings: string[] = []

  if (!ID_PATTERN.test(settings.derivedId)) {
    findings.push('The optimised index needs an id: letters, digits, dash or underscore.')
  }
  if (settings.derivedId === indexId) {
    findings.push('The optimised index needs an id of its own, not the parent’s.')
  }
  if (settings.derivedName.trim() === '') {
    findings.push('The optimised index needs a name.')
  }

  return findings
}

/**
 * A starting point for the child's identity, not a rule.
 *
 * Both fields are editable; this only saves the typing for the naming
 * everyone does anyway. Overwriting what the user typed would be worse than
 * a blank box, so callers fill these once, when the box is untouched.
 */
export function suggestDerived(indexId: string, name: string): { id: string; name: string } {
  return {
    id: `${indexId}-OPT`.slice(0, 64),
    name: name === '' ? `${indexId} optimised` : `${name} optimised`
  }
}
