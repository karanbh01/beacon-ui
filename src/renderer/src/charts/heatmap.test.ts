import { describe, expect, it } from 'vitest'
import { RAW } from '../tokens/tokens'
import { correlationPosition, heatColor, heatTextColor } from './heatmap'

function toRgb(hex: string): string {
  const value = hex.replace('#', '')
  const parts = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  return `rgb(${parts.join(', ')})`
}

describe('heatColor', () => {
  it('lands exactly on the approved stops at 0, 0.5 and 1', () => {
    // The three values were approved as sRGB; the endpoints must be them and
    // not something a colour-space conversion produced.
    expect(heatColor(0)).toBe(toRgb(RAW.heatmapLow))
    expect(heatColor(0.5)).toBe(toRgb(RAW.heatmapMid))
    expect(heatColor(1)).toBe(toRgb(RAW.heatmapHigh))
  })

  it('interpolates between two stops rather than snapping', () => {
    const quarter = heatColor(0.25)
    expect(quarter).not.toBe(heatColor(0))
    expect(quarter).not.toBe(heatColor(0.5))
    expect(quarter).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('clamps rather than extrapolating off the ends', () => {
    expect(heatColor(-3)).toBe(heatColor(0))
    expect(heatColor(9)).toBe(heatColor(1))
  })

  it('does not depend on the theme', () => {
    // Taxonomy 9: the colour IS the measurement, so a correlation of 0.8 must
    // be the same colour in light and dark. `heatColor` takes no mode, and
    // this asserts that the signature stays that way.
    expect(heatColor.length).toBe(1)
  })
})

describe('correlationPosition', () => {
  it('centres zero, so an uncorrelated pair is neutral rather than "low"', () => {
    // Mapping 0–1 would paint every uncorrelated pair with the low colour,
    // which reads as reassuring when it is not.
    expect(correlationPosition(0)).toBe(0.5)
    expect(correlationPosition(-1)).toBe(0)
    expect(correlationPosition(1)).toBe(1)
  })

  it('clamps a value outside the correlation range', () => {
    expect(correlationPosition(-4)).toBe(0)
    expect(correlationPosition(4)).toBe(1)
  })
})

describe('heatTextColor', () => {
  it('darkens the label over the light middle of the map', () => {
    expect(heatTextColor(0.5)).toBe(RAW.paperInk)
  })

  it('keeps it white over the saturated ends', () => {
    expect(heatTextColor(0)).toBe('#ffffff')
    expect(heatTextColor(1)).toBe('#ffffff')
  })
})
