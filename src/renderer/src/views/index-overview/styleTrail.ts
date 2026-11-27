/*
 * The outline round everywhere a name has sat in the style box (Karan,
 * 2026-11-26), drawn smooth: each place spreads a soft bump, the bumps add
 * up, and the outline is where their sum crosses one level, so two places
 * near each other melt into one blob rather than meeting in a notch.
 */

/** How finely the outline is traced, in px; finer than a pixel gains nothing at this size. */
const STEP = 1.5

/**
 * The bump's spread against the reach. At this ratio a lone place's outline
 * is a circle of the reach's radius, so the outline is the size the ring
 * round one place always was.
 */
const SPREAD = 1 / 1.2

/**
 * The outline as SVG path data: short straight pieces from marching squares
 * over the summed bumps, fine enough to read as a curve. Traced a reach past
 * every side so it closes round a place at the edge; the box clips it.
 */
export function trailOutline(
  places: readonly { x: number; y: number }[],
  /** How far the outline runs round a lone place, in px. */
  reach: number,
  /** The box's side, in px. */
  side: number
): string {
  if (places.length === 0) return ''
  const sigma = reach * SPREAD
  const level = Math.exp(-(reach * reach) / (2 * sigma * sigma))
  const from = -reach
  const count = Math.ceil((side + 2 * reach) / STEP) + 1
  const at = (step: number): number => from + step * STEP

  const field: number[][] = []
  for (let row = 0; row < count; row += 1) {
    const line: number[] = []
    for (let column = 0; column < count; column += 1) {
      line.push(heightAt(places, at(column), at(row), sigma))
    }
    field.push(line)
  }

  const pieces: string[] = []
  for (let row = 0; row < count - 1; row += 1) {
    for (let column = 0; column < count - 1; column += 1) {
      for (const [one, two] of crossings(field, row, column, level)) {
        pieces.push(
          `M${fixed(at(column + one.x))} ${fixed(at(row + one.y))}L${fixed(at(column + two.x))} ${fixed(at(row + two.y))}`
        )
      }
    }
  }
  return pieces.join('')
}

function heightAt(
  places: readonly { x: number; y: number }[],
  x: number,
  y: number,
  sigma: number
): number {
  let sum = 0
  for (const place of places) {
    const across = x - place.x
    const down = y - place.y
    sum += Math.exp(-(across * across + down * down) / (2 * sigma * sigma))
  }
  return sum
}

interface Point {
  /** Across the cell, 0 to 1. */
  x: number
  /** Down the cell, 0 to 1. */
  y: number
}

/**
 * Where the level crosses one cell's edges, paired into the pieces of
 * outline inside it. Corners clockwise from the top left; a corner over the
 * level is inside the blob. The two saddle cases are split one fixed way,
 * which at this step no reader can tell from the other.
 */
function crossings(
  field: number[][],
  row: number,
  column: number,
  level: number
): [Point, Point][] {
  const a = field[row]?.[column] ?? 0
  const b = field[row]?.[column + 1] ?? 0
  const c = field[row + 1]?.[column + 1] ?? 0
  const d = field[row + 1]?.[column] ?? 0
  const share = (from: number, to: number): number => (level - from) / (to - from)
  const top = (): Point => ({ x: share(a, b), y: 0 })
  const right = (): Point => ({ x: 1, y: share(b, c) })
  const bottom = (): Point => ({ x: share(d, c), y: 1 })
  const left = (): Point => ({ x: 0, y: share(a, d) })

  const inside = (value: number): number => (value > level ? 1 : 0)
  switch (inside(a) * 8 + inside(b) * 4 + inside(c) * 2 + inside(d)) {
    case 1:
    case 14:
      return [[left(), bottom()]]
    case 2:
    case 13:
      return [[bottom(), right()]]
    case 3:
    case 12:
      return [[left(), right()]]
    case 4:
    case 11:
      return [[top(), right()]]
    case 5:
      return [
        [left(), top()],
        [bottom(), right()]
      ]
    case 6:
    case 9:
      return [[top(), bottom()]]
    case 7:
    case 8:
      return [[left(), top()]]
    case 10:
      return [
        [top(), right()],
        [left(), bottom()]
      ]
    default:
      return []
  }
}

const fixed = (value: number): string => value.toFixed(1)
