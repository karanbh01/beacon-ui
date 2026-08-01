export interface CurvePoint {
  expiry: string
  timeToExpiry: number
  theoretical: number
  financingRate: number
  /** Theoretical minus spot: positive in contango, negative in backwardation. */
  overSpot: number
}

/**
 * The curve's shape, in the word a trader would use.
 *
 * py-beacon's `annualised_roll` is positive in BACKWARDATION — the roll earns
 * when the curve slopes down — which is the opposite sign to `overSpot`. The
 * two are consistent; the naming is what trips people, so this function
 * exists to state the convention once.
 */
export function describeShape(annualisedRoll: number): string {
  if (annualisedRoll === 0) return 'flat'
  return annualisedRoll > 0 ? 'backwardation' : 'contango'
}

/** Whether the curve rises with tenor across every step. */
export function isMonotonic(points: readonly CurvePoint[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (previous === undefined || current === undefined) continue
    if (current.theoretical < previous.theoretical) return false
  }
  return true
}

/**
 * Quarter-end expiries, as a starting point.
 *
 * `/derivatives/{id}/term-structure` REQUIRES a list of expiries — it prices
 * contracts, and there is no such thing as "the" curve without saying which
 * contracts. py-beacon publishes no contract calendar, so the pane offers
 * quarter-ends as an editable default rather than inventing an exchange's
 * schedule (third Friday of the IMM months) that this engine has never
 * confirmed.
 */
export function defaultExpiries(from: Date, count = 4): string[] {
  const expiries: string[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))

  while (expiries.length < count) {
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    const month = cursor.getUTCMonth()
    if (month % 3 !== 2) continue
    // Last day of that quarter month.
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), month + 1, 0))
    if (end > from) expiries.push(end.toISOString().slice(0, 10))
  }

  return expiries
}

/** Parse the editable expiry list, keeping only well-formed dates. */
export function parseExpiries(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part))
}
