import { describe, expect, it } from 'vitest'
import type { TableFrame } from '../api/frame'
import { COLORS } from '../tokens/tokens'
import {
  chartOptions,
  histogramOptions,
  lineOptions,
  seriesColor,
  seriesColors,
  withAlpha
} from './theme'
import {
  drawdown,
  maxDrawdown,
  rebase100,
  toLineData,
  toPoints,
  toTime,
  totalReturn,
  type Point
} from './transform'

const FRAME: TableFrame = {
  index: ['2026-07-20T00:00:00', '2026-07-21T00:00:00', '2026-07-22T00:00:00'],
  columns: ['Close', 'Volume'],
  data: [
    [100, 1_000],
    [null, 2_000],
    [110, 3_000]
  ]
}

function points(...values: number[]): Point[] {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    value
  }))
}

describe('toPoints', () => {
  it('finds the column whatever py-beacon capitalised it as', () => {
    expect(toPoints(FRAME, 'close')).toHaveLength(2)
  })

  it('drops nulls instead of plotting them as zero', () => {
    // A zero would draw a spike down to the axis that no data supports.
    expect(toPoints(FRAME, 'close').map((p) => p.value)).toEqual([100, 110])
  })

  it('returns nothing for a column the frame does not have', () => {
    expect(toPoints(FRAME, 'nope')).toEqual([])
    expect(toPoints(undefined, 'close')).toEqual([])
  })
})

describe('toTime', () => {
  it('reads a date as UTC midnight whichever shape py-beacon sent', () => {
    // `new Date('2026-07-28T00:00:00')` is LOCAL; the two forms would
    // otherwise land on different days either side of the date line.
    expect(toTime('2026-07-28')).toBe(toTime('2026-07-28T00:00:00'))
    expect(toTime('2026-07-28')).toBe(Date.UTC(2026, 6, 28) / 1000)
  })

  it('produces seconds, which is what the chart wants', () => {
    expect(toLineData(points(1))[0]?.time).toBe(toTime('2026-01-01'))
  })
})

describe('rebase100', () => {
  it('starts every series at 100 so different price levels share an axis', () => {
    expect(rebase100(points(50, 75, 100)).map((p) => p.value)).toEqual([100, 150, 200])
  })

  it('leaves a series alone rather than producing infinities', () => {
    // A zero or negative base makes the ratio meaningless, and the chart
    // would silently clip whatever came out.
    expect(rebase100(points(0, 5)).map((p) => p.value)).toEqual([0, 5])
    expect(rebase100([])).toEqual([])
  })
})

describe('drawdown', () => {
  it('measures against the running peak, not the whole-series maximum', () => {
    // A drawdown measured against a peak that has not happened yet is not a
    // drawdown anyone lived through.
    const series = drawdown(points(100, 80, 120, 60))
    expect(series.map((p) => Math.round(p.value))).toEqual([0, -20, 0, -50])
  })

  it('is never positive, which is why the subpanel points down', () => {
    for (const point of drawdown(points(1, 9, 3, 7, 2))) {
      expect(point.value).toBeLessThanOrEqual(0)
    }
  })

  it('reports the worst point for the caption', () => {
    expect(maxDrawdown(drawdown(points(100, 80, 120, 60)))?.value).toBeCloseTo(-50, 6)
    expect(maxDrawdown([])).toBeUndefined()
  })
})

describe('totalReturn', () => {
  it('measures first to last', () => {
    expect(totalReturn(points(100, 50, 120))).toBeCloseTo(20, 6)
  })

  it('says nothing when there is nothing to divide by', () => {
    expect(totalReturn(points(0, 5))).toBeUndefined()
    expect(totalReturn([])).toBeUndefined()
  })
})

describe('chart theme', () => {
  it('paints with the same literals the CSS uses', () => {
    // Charts cannot read CSS custom properties, so `tokens.ts` emits the
    // resolved value. Both come from one generator, so they cannot drift.
    const options = chartOptions('dark')
    expect(options.layout?.background).toMatchObject({ color: COLORS.dark.canvas })
    expect(options.layout?.textColor).toBe(COLORS.dark['text-muted'])
    expect(options.grid?.horzLines?.color).toBe(COLORS.dark.divider)
  })

  it('puts the price scale on the left, as every Figma frame does', () => {
    const options = chartOptions('light')
    expect(options.leftPriceScale?.visible).toBe(true)
    expect(options.rightPriceScale?.visible).toBe(false)
  })

  it('draws horizontal gridlines only', () => {
    expect(chartOptions('light').grid?.vertLines?.visible).toBe(false)
  })

  it('changes every colour between the two themes', () => {
    expect(chartOptions('light').layout?.textColor).not.toBe(chartOptions('dark').layout?.textColor)
  })

  it('uses the three approved series tokens, then wraps', () => {
    // A fourth compared asset reuses a colour rather than inventing one no
    // token approves.
    expect(seriesColors('light')).toHaveLength(3)
    expect(seriesColor('light', 3)).toBe(seriesColor('light', 0))
  })

  it('labels the last value on the axis instead of drawing a price line', () => {
    const options = lineOptions('light', 0)
    expect(options.lastValueVisible).toBe(true)
    expect(options.priceLineVisible).toBe(false)
  })

  it('keeps a subpanel quiet — no axis label competing with the main pane', () => {
    expect(histogramOptions('light').lastValueVisible).toBe(false)
  })
})

describe('withAlpha', () => {
  it('returns rgba, which is the form the chart parser is certain to accept', () => {
    expect(withAlpha('#4a88c7', 0.35)).toBe('rgba(74, 136, 199, 0.35)')
  })

  it('leaves a value it cannot parse alone rather than emitting rgba(NaN…)', () => {
    expect(withAlpha('red', 0.5)).toBe('red')
  })
})

describe('what the pointer can do to a chart (BU-134)', () => {
  it('leaves the wheel to the pane it sits in', () => {
    // A pane that scrolls and a chart that zooms are competing for the same
    // gesture, and the pane asked first.
    const options = chartOptions('light')
    expect(options.handleScroll).toMatchObject({ mouseWheel: false })
    expect(options.handleScale).toMatchObject({ mouseWheel: false })
  })

  it('takes a drag on either axis, which is unambiguous', () => {
    const options = chartOptions('dark')
    expect(options.handleScale).toMatchObject({
      axisPressedMouseMove: { time: true, price: true },
      // And a double-click puts either back to automatic.
      axisDoubleClickReset: { time: true, price: true }
    })
  })
})
