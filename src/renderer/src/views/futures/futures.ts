import type { components } from '@shared/api.generated'

export type CarryDecomposition = components['schemas']['CarryDecomposition']

export interface CarryRow {
  label: string
  value: number
  tone: 'positive' | 'negative' | 'default'
}

/**
 * The carry decomposition as rows, in the order the maths applies them.
 *
 * The residual is shown rather than folded away: py-beacon documents it as
 * the compounding the decomposition cannot attribute, so hiding it would make
 * three parts appear to sum exactly to a total they do not.
 */
export function carryRows(carry: CarryDecomposition): CarryRow[] {
  return [
    { label: 'Financing', value: carry.financing, tone: tone(carry.financing) },
    // Always negative by construction — dividends reduce the forward — so it
    // is labelled as a reduction rather than shown as a surprise.
    { label: 'Dividend', value: carry.dividend, tone: tone(carry.dividend) },
    { label: 'Borrow', value: carry.borrow, tone: tone(carry.borrow) },
    { label: 'Residual', value: carry.residual, tone: 'default' },
    { label: 'Total', value: carry.total, tone: tone(carry.total) }
  ]
}

function tone(value: number): 'positive' | 'negative' | 'default' {
  if (value === 0) return 'default'
  return value > 0 ? 'positive' : 'negative'
}

export function money(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function rate(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(dp)}%`
}

/**
 * The textbook forward, for checking the engine rather than replacing it.
 *
 * BU-31's acceptance says values must match `S·e^((r−q)T)`. This is that
 * formula, used only in tests — the pane always shows what py-beacon
 * computed, because an app that quietly prices things itself would disagree
 * with the engine the moment either changed.
 */
export function costOfCarry(
  spot: number,
  riskFreeRate: number,
  dividendYield: number,
  timeToExpiry: number,
  borrowCost = 0
): number {
  return spot * Math.exp((riskFreeRate - dividendYield - borrowCost) * timeToExpiry)
}
