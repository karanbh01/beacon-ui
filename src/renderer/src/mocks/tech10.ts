/**
 * The sanctioned mock dataset (taxonomy 10).
 *
 * Numbers across the app reconcile off ONE set of figures. New mock data must
 * join this web rather than invent parallel numbers, otherwise stories and
 * views quietly contradict each other and the reconciliation renderers in
 * BU-35 start warning on our own fixtures.
 *
 * The identities that must hold:
 *   base 100 on 31 Dec 2019            -> level 341.34
 *   weights sum                        -> 100.00, three names capped
 *   +15.13 - 0.84 cap drag - 0.09 costs -> +14.20 YTD
 *   TE 1.8%                            -> TE^2 3.24
 */

export const TECH10 = {
  name: 'TECH10',
  baseDate: '31 Dec 2019',
  baseLevel: 100,
  level: 341.34,
  asOf: '27 Jul 2026',

  /** Attribution decomposes exactly into ytd. */
  attribution: {
    gross: 15.13,
    capDrag: -0.84,
    costs: -0.09,
    ytd: 14.2
  },

  weights: {
    constituents: 10,
    sum: 100.0,
    capped: 3
  },

  risk: {
    trackingError: 1.8,
    /** TE squared, the decomposition total. */
    trackingErrorSq: 3.24
  }
} as const

/** Formats a signed percentage the way the design shows it. */
export function signedPct(value: number, dp = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(dp)}%`
}
