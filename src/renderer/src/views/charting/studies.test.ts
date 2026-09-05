import { describe, expect, it } from 'vitest'
import { INDICATORS, panesFor, studiesFor } from './studies'
import type { Point } from '../../charts/transform'

/** Long enough for MA 200 to have somewhere to start. */
function bars(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
    value: 100 + Math.sin(index / 9) * 5
  }))
}

describe('indicators offered (BU-157)', () => {
  it('names its periods, since every package picks different ones', () => {
    expect(INDICATORS).toEqual(['MA 20', 'MA 50', 'MA 200', 'MACD', 'RSI'])
  })
})

describe('studies on the price scale (BU-157)', () => {
  it('draws only what was chosen, and colours them apart', () => {
    const drawn = studiesFor(['MA 20', 'MA 50'], bars(120))

    expect(drawn.map((study) => study.label)).toEqual(['MA 20', 'MA 50'])
    expect(new Set(drawn.map((study) => study.tone)).size).toBe(2)
  })

  it('says nothing where the window is longer than the range', () => {
    // Six months of bars cannot carry a 200-day average, and a short line
    // from a partial window would be a different indicator wearing the name.
    expect(studiesFor(['MA 200'], bars(120))).toEqual([])
    expect(studiesFor(['MA 200'], bars(260))).toHaveLength(1)
  })

  it('draws nothing when nothing is chosen', () => {
    expect(studiesFor([], bars(120))).toEqual([])
  })
})

describe('oscillator panes (BU-157)', () => {
  it('gives MACD its three series, bars first', () => {
    const [pane] = panesFor(['MACD'], bars(120))

    expect(pane?.label).toBe('MACD · 12, 26, 9')
    expect(pane?.series.map((entry) => entry.kind)).toEqual(['histogram', 'line', 'line'])
    // Zero is where the crossing everyone watches for happens.
    expect(pane?.series[1]?.guides).toEqual([0])
  })

  it('bands RSI at 30 and 70, which is what the numbers mean', () => {
    const [pane] = panesFor(['RSI'], bars(120))

    expect(pane?.label).toBe('RSI · 14')
    expect(pane?.series[0]?.guides).toEqual([30, 70])
  })

  it('keeps the order of the control, and asks for room to be read in', () => {
    const panes = panesFor(['RSI', 'MACD'], bars(120))

    expect(panes.map((pane) => pane.label)).toEqual(['MACD · 12, 26, 9', 'RSI · 14'])
    // Two shares against volume's one: these are read for values.
    expect(panes.every((pane) => pane.share === 2)).toBe(true)
  })

  it('opens no pane it has no data for', () => {
    expect(panesFor(['MACD', 'RSI'], bars(10))).toEqual([])
    expect(panesFor([], bars(120))).toEqual([])
  })
})
