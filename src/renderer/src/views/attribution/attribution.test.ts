import { describe, expect, it, vi } from 'vitest'
import {
  attributionRows,
  reconciles,
  residualPercent,
  warnIfUnreconciled,
  type AttributionView
} from './attribution'

function view(overrides: Partial<AttributionView> = {}): AttributionView {
  return {
    index_id: 'TECH10',
    start: '2026-01-01',
    end: '2026-07-22',
    periods: 138,
    total_return: 0.142,
    residual: 0,
    reconciles: true,
    cap_drag: -0.008,
    cost_drag: null,
    contributions: [
      { asset_id: 'AVGO', average_weight: 0.174, total_return: 0.269, contribution: 0.0468 },
      { asset_id: 'NVDA', average_weight: 0.19, total_return: 0.213, contribution: 0.0405 },
      { asset_id: 'CRM', average_weight: 0.05, total_return: -0.089, contribution: -0.0045 }
    ],
    ...overrides
  }
}

describe('attributionRows', () => {
  it('orders by contribution, largest first', () => {
    expect(attributionRows(view()).map((row) => row.ticker)).toEqual(['AVGO', 'NVDA', 'CRM'])
  })

  it('reports each name’s share of the index return', () => {
    const rows = attributionRows(view())
    expect(rows[0]?.shareOfTotal).toBeCloseTo((0.0468 / 0.142) * 100, 6)
  })

  it('says nothing about shares when the index went nowhere', () => {
    // Dividing by a zero return would make every row infinitely important.
    const flat = attributionRows(view({ total_return: 0 }))
    expect(flat[0]?.shareOfTotal).toBeUndefined()
  })

  it('scales the bar against the largest ABSOLUTE contribution', () => {
    // A detractor is as visually significant as a contributor of the same
    // size; scaling on signed values would collapse the negative bars.
    const rows = attributionRows(view())
    expect(rows[0]?.magnitude).toBe(1)
    expect(rows[2]?.magnitude).toBeCloseTo(0.0045 / 0.0468, 6)
  })

  it('does not mutate the response', () => {
    const original = view()
    const first = original.contributions[0]
    attributionRows(original)
    expect(original.contributions[0]).toBe(first)
  })
})

describe('reconciliation', () => {
  it('trusts the engine’s own verdict rather than re-deriving one', () => {
    // py-beacon knows its tolerance; a client recomputing the sum would
    // disagree with it at the edges for no benefit.
    expect(reconciles(view())).toBe(true)
    expect(reconciles(view({ reconciles: false }))).toBe(false)
  })

  it('reports the residual as a percentage', () => {
    expect(residualPercent(view({ residual: 0.0012 }))).toBeCloseTo(0.12, 6)
  })
})

describe('warnIfUnreconciled', () => {
  it('says nothing when the parts add up', () => {
    expect(warnIfUnreconciled(view(), true)).toBeUndefined()
  })

  it('names the index, the residual and the total it failed to match', () => {
    const message = warnIfUnreconciled(view({ reconciles: false, residual: 0.0012 }), false)

    expect(message).toContain('TECH10')
    expect(message).toContain('0.1200%')
    expect(message).toContain('withholding')
  })

  it('warns on the console only in dev — a packaged user cannot act on it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    warnIfUnreconciled(view({ reconciles: false }), false)
    expect(warn).not.toHaveBeenCalled()

    warnIfUnreconciled(view({ reconciles: false }), true)
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })
})
