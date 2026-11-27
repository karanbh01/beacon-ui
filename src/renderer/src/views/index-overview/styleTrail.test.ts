import { describe, expect, it } from 'vitest'
import { trailOutline } from './styleTrail'

/** Every point the path's pieces start or end at. */
function pointsOf(path: string): { x: number; y: number }[] {
  return [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2])
  }))
}

describe('trailOutline', () => {
  it('draws nothing for a name with no places', () => {
    expect(trailOutline([], 10, 144)).toBe('')
  })

  it('rings a lone place at the reach', () => {
    const points = pointsOf(trailOutline([{ x: 72, y: 72 }], 10, 144))
    expect(points.length).toBeGreaterThan(20)
    for (const point of points) {
      expect(Math.hypot(point.x - 72, point.y - 72)).toBeCloseTo(10, 0)
    }
  })

  it('melts two near places into one outline with nothing between them', () => {
    const points = pointsOf(
      trailOutline(
        [
          { x: 60, y: 72 },
          { x: 76, y: 72 }
        ],
        10,
        144
      )
    )
    // No piece of outline sits on the line between the two places.
    expect(points.some((point) => point.x > 62 && point.x < 74 && Math.abs(point.y - 72) < 4)).toBe(
      false
    )
  })
})
