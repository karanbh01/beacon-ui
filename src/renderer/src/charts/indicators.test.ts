import { describe, expect, it } from 'vitest'
import { ema, macd, rsi, sma } from './indicators'
import type { Point } from './transform'

/** A series with dates that sort, since every study is joined on date. */
function series(values: readonly number[]): Point[] {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    value
  }))
}

describe('sma (BU-157)', () => {
  it('averages each complete window, and starts where the first one closes', () => {
    const drawn = sma(series([1, 2, 3, 4, 5]), 3)

    expect(drawn.map((point) => point.value)).toEqual([2, 3, 4])
    // Dated at the END of its window: an average of the three days to the 3rd
    // is a fact about the 3rd, not about the 1st.
    expect(drawn[0]?.date).toBe('2026-01-03')
  })

  it('has nothing to say until it has a full window', () => {
    expect(sma(series([1, 2]), 3)).toEqual([])
    expect(sma(series([1, 2, 3]), 0)).toEqual([])
  })
})

describe('ema (BU-157)', () => {
  it('seeds with the simple average of the first window', () => {
    const drawn = ema(series([1, 2, 3, 4]), 3)

    // (1+2+3)/3 = 2, then 4 * 0.5 + 2 * 0.5 = 3.
    expect(drawn.map((point) => point.value)).toEqual([2, 3])
  })

  it('holds a flat series flat', () => {
    const drawn = ema(series([5, 5, 5, 5, 5]), 3)
    expect(drawn.every((point) => point.value === 5)).toBe(true)
  })
})

describe('macd (BU-157)', () => {
  it('is zero throughout on a series that does not move', () => {
    const drawn = macd(series(Array.from({ length: 60 }, () => 100)))

    expect(drawn.line.length).toBeGreaterThan(0)
    expect(drawn.line.every((point) => Math.abs(point.value) < 1e-9)).toBe(true)
    expect(drawn.histogram.every((point) => Math.abs(point.value) < 1e-9)).toBe(true)
  })

  it('is positive while the fast average leads, on a rising series', () => {
    const drawn = macd(series(Array.from({ length: 80 }, (_, index) => 100 + index)))
    const last = drawn.line.at(-1)

    expect(last?.value ?? 0).toBeGreaterThan(0)
  })

  it('joins its parts on date, so every histogram bar has a line above it', () => {
    const drawn = macd(series(Array.from({ length: 80 }, (_, index) => 100 + Math.sin(index))))
    const dates = new Set(drawn.line.map((point) => point.date))

    expect(drawn.histogram.every((point) => dates.has(point.date))).toBe(true)
    // The signal starts nine bars after the line, and the histogram with it.
    expect(drawn.histogram).toHaveLength(drawn.signal.length)
  })
})

describe('rsi (BU-157)', () => {
  it('pins to 100 when nothing has fallen', () => {
    const drawn = rsi(series(Array.from({ length: 30 }, (_, index) => 100 + index)))
    expect(drawn.at(-1)?.value).toBe(100)
  })

  it('pins to 0 when nothing has risen', () => {
    const drawn = rsi(series(Array.from({ length: 30 }, (_, index) => 100 - index)))
    expect(drawn.at(-1)?.value).toBe(0)
  })

  it('stays about the middle of the scale on a series that alternates evenly', () => {
    const drawn = rsi(series(Array.from({ length: 40 }, (_, index) => 100 + (index % 2))))

    // About, not at: Wilder's smoothing weights the latest bar, so an
    // up-down series lands a couple of points either side of 50 depending on
    // which of the two the last bar was.
    for (const point of drawn) {
      expect(point.value).toBeGreaterThan(45)
      expect(point.value).toBeLessThan(55)
    }
  })

  it('says nothing without a full lookback', () => {
    expect(rsi(series([1, 2, 3]), 14)).toEqual([])
  })
})
