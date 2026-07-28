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
    capped: 3,
    cap: 20,
    /** Σ of the top five weights. */
    top5: 83.5,
    /** Herfindahl index on fractional weights. */
    hhi: 0.158,
    /** 1 / HHI. */
    effectiveN: 6.3,
    driftSinceRebalance: 1.4
  },

  risk: {
    trackingError: 1.8,
    /** TE squared, the decomposition total. */
    trackingErrorSq: 3.24
  }
} as const

export interface Constituent {
  ticker: string
  name: string
  industry: string
  /** Percent, e.g. 16.62. */
  weight: number
  /** Thousands. */
  shares: number
  /** Percentage-point drift since the last rebalance. */
  delta: number
  /** True when pinned at the 20% cap. */
  capped: boolean
}

/**
 * The Weights & Constituents table (Figma 355:2331). Read from the frame
 * rather than invented, so it satisfies the identities above: weights sum to
 * 100.00, exactly three names sit at the 20% cap, and the drifts net to zero.
 */
export const CONSTITUENTS: readonly Constituent[] = [
  {
    ticker: 'NVDA',
    name: 'NVIDIA',
    industry: 'Semiconductors',
    weight: 20.0,
    shares: 1284,
    delta: 0,
    capped: true
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft',
    industry: 'Systems Software',
    weight: 20.0,
    shares: 412,
    delta: 0,
    capped: true
  },
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    industry: 'Tech Hardware & Storage',
    weight: 20.0,
    shares: 946,
    delta: 0,
    capped: true
  },
  {
    ticker: 'AVGO',
    name: 'Broadcom',
    industry: 'Semiconductors',
    weight: 16.62,
    shares: 521,
    delta: 0.42,
    capped: false
  },
  {
    ticker: 'ORCL',
    name: 'Oracle',
    industry: 'Application Software',
    weight: 6.92,
    shares: 308,
    delta: -0.18,
    capped: false
  },
  {
    ticker: 'PLTR',
    name: 'Palantir',
    industry: 'Application Software',
    weight: 4.54,
    shares: 1640,
    delta: 0.61,
    capped: false
  },
  {
    ticker: 'IBM',
    name: 'IBM',
    industry: 'IT Consulting',
    weight: 3.23,
    shares: 142,
    delta: -0.11,
    capped: false
  },
  {
    ticker: 'AMD',
    name: 'AMD',
    industry: 'Semiconductors',
    weight: 3.08,
    shares: 224,
    delta: 0.14,
    capped: false
  },
  {
    ticker: 'CSCO',
    name: 'Cisco Systems',
    industry: 'Communications Equipment',
    weight: 2.97,
    shares: 418,
    delta: -0.07,
    capped: false
  },
  {
    ticker: 'CRM',
    name: 'Salesforce',
    industry: 'Application Software',
    weight: 2.64,
    shares: 168,
    delta: -0.81,
    capped: false
  }
]

/** Formats a signed percentage the way the design shows it. */
export function signedPct(value: number, dp = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(dp)}%`
}

/** Signed number without a unit, for the drift column. */
export function signed(value: number, dp = 2): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(dp)}`
}

/**
 * Generates a large but plausible set for virtualisation testing. These do
 * NOT reconcile — they are a load fixture, not index data, and must never be
 * used where the identities above matter.
 */
export function syntheticConstituents(count: number): Constituent[] {
  const template = CONSTITUENTS
  return Array.from({ length: count }, (_, index) => {
    const base = template[index % template.length] ?? template[0]
    if (base === undefined) throw new Error('CONSTITUENTS is empty')
    return {
      ...base,
      ticker: `${base.ticker}${String(Math.floor(index / template.length))}`,
      weight: Number((base.weight / (1 + index / 400)).toFixed(2))
    }
  })
}
