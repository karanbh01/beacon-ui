/*
 * Drifting Greek glyphs, as on the website's landing cards (beacon-site
 * content/assets/js/ascii.js, which Karan liked): a grid of letters that
 * comes and goes in slow, organic blobs. Capitals where the field is dense,
 * lower case at its edges, in the card's two inks.
 *
 * The field is smooth noise bent by a second, slower field, so it moves like
 * an amoeba, wandering and changing shape. The constants are the site's, so
 * the two read as the same thing; the site's notes on each are kept. The
 * pixels are laid down by glyphRaster.ts.
 */

import { SIZE, stamp, type GlyphSprites, type Raster } from './glyphRaster'

/** About how wide a blob is, in pixels. */
const BLOB = 112

// A cell shows a glyph where the field passes THRESHOLD, fully once it is
// EDGE above it, and a capital where it passes DENSE.
const THRESHOLD = 0.42
const EDGE = 0.07
const DENSE = 0.56

// The field is sampled through a second, slower noise field that bends it
// (WARP), so its edges bulge, reach out and draw back. EVOLVE is how fast its
// shapes change, WANDER how far the whole field drifts, along a path that
// keeps turning.
const WARP = 1.4
const WARP_SCALE = 0.55
/**
 * Cells between the bending field's samples, blended between. It turns over
 * some two hundred pixels, so sampling it every cell was most of the work
 * in a frame for nothing the eye can see.
 */
const WARP_STEP = 4
const WARP_SPEED = 0.07
const EVOLVE = 0.17
const WANDER = 0.9

// Where the glyphs meet the words: not a cut. Behind the words they show at
// BEHIND strength at most, and rise to full strength over FADE pixels beyond
// them, from a broad curve up to twice REACH away that slowly moves.
const BEHIND = 0.16
const REACH = 33
const FADE = 135
/** Too faint to see, so not worth drawing. */
const FAINT = 0.03

export interface FieldFrame {
  width: number
  height: number
  /** The words' top edge, in the card's pixels; the field lies above it. */
  wordsTop: number
  wordsBottom: number
  seed: number
}

// Integer hash to [0, 1), so the same cell and moment always agree.
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(from: number, to: number, x: number): number {
  return ease(Math.min(1, Math.max(0, (x - from) / (to - from))))
}

/** Value noise in three dimensions, the third being time. */
export function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = ease(x - xi)
  const yf = ease(y - yi)
  const zf = ease(z - zi)
  const corner = (dx: number, dy: number, dz: number): number => hash(xi + dx, yi + dy, zi + dz)

  const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), xf)
  const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), xf)
  const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), xf)
  const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), xf)
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf)
}

/** Two octaves: broad blobs, with finer ragged edges. */
function blobs(x: number, y: number, t: number): number {
  return 0.68 * noise(x, y, t) + 0.32 * noise(x * 2.3 + 17, y * 2.3 + 5, t * 1.4)
}

/** Where the cell grid sits in the field: column c is at x0 + c * dx. */
interface Grid {
  x0: number
  dx: number
  y0: number
  dy: number
}

/** How far the slow field pushes each point, every WARP_STEP cells. */
interface Warp {
  x: Float32Array
  y: Float32Array
  /** Samples in a row of the grid. */
  across: number
}

function warpGrid(columns: number, rows: number, grid: Grid, warpTime: number): Warp {
  const across = Math.ceil(columns / WARP_STEP) + 1
  const down = Math.ceil(rows / WARP_STEP) + 1
  const warp = { x: new Float32Array(across * down), y: new Float32Array(across * down), across }
  for (let row = 0; row < down; row++) {
    const y = (grid.y0 + row * WARP_STEP * grid.dy) * WARP_SCALE
    for (let column = 0; column < across; column++) {
      const x = (grid.x0 + column * WARP_STEP * grid.dx) * WARP_SCALE
      warp.x[row * across + column] = (noise(x + 41, y, warpTime) - 0.5) * WARP * 2
      warp.y[row * across + column] = (noise(x, y + 73, warpTime) - 0.5) * WARP * 2
    }
  }
  return warp
}

/** A cell's push, blended from the four samples around it. */
function pushAt(samples: Float32Array, across: number, column: number, row: number): number {
  const left = Math.floor(column / WARP_STEP)
  const top = Math.floor(row / WARP_STEP)
  const tx = (column - left * WARP_STEP) / WARP_STEP
  const ty = (row - top * WARP_STEP) / WARP_STEP
  const at = top * across + left
  const upper = lerp(samples[at] ?? 0, samples[at + 1] ?? 0, tx)
  const lower = lerp(samples[at + across] ?? 0, samples[at + across + 1] ?? 0, tx)
  return lerp(upper, lower, ty)
}

/** The edge's curve at each column: a slow swell and a wander. */
function edges(columns: number, cellWidth: number, seed: number, time: number): Float32Array {
  const offsets = new Float32Array(columns)
  for (let column = 0; column < columns; column++) {
    const x = column * cellWidth
    const wander = noise(x * 0.0053 + seed, 7.7, time * 0.09) - 0.5
    const swell = Math.sin(x * 0.0073 + time * 0.22 + seed)
    offsets[column] = (wander * 1.4 + swell * 0.55) * REACH
  }
  return offsets
}

/** How strongly the field shows at height y, with the words below it. */
function weight(frame: FieldFrame, y: number, offset: number): number {
  const past = frame.wordsTop - y
  if (past <= 0) {
    const height = Math.max(1, frame.wordsBottom - frame.wordsTop)
    return BEHIND * Math.max(0, 1 + past / height)
  }
  const start = REACH + offset
  return BEHIND + (1 - BEHIND) * smoothstep(start, start + FADE, past)
}

/** One frame of the field at `time` seconds, into `raster`, cleared first. */
export function drawField(
  raster: Raster,
  frame: FieldFrame,
  sprites: GlyphSprites,
  time: number
): void {
  const { width, height, seed } = frame
  raster.words.fill(0)
  if (sprites.dense === 0) return

  const cellWidth = (SIZE * 5) / 6
  const cellHeight = SIZE
  const columns = Math.ceil(width / cellWidth)
  const rows = Math.ceil(height / cellHeight)

  const evolve = time * EVOLVE + seed
  const warpTime = time * WARP_SPEED + seed * 0.5
  // Sums of slow sines at unrelated rates never settle into a line.
  const driftX = WANDER * (Math.sin(time * 0.13 + seed) + 0.6 * Math.sin(time * 0.071))
  const driftY = WANDER * (Math.cos(time * 0.097 + seed) + 0.6 * Math.sin(time * 0.053))
  const offsets = edges(columns, cellWidth, seed, time)
  const grid = { x0: driftX + seed, dx: cellWidth / BLOB, y0: driftY, dy: cellHeight / BLOB }
  const warp = warpGrid(columns, rows, grid, warpTime)

  for (let row = 0; row < rows; row++) {
    const y = row * cellHeight + cellHeight / 2
    for (let column = 0; column < columns; column++) {
      // Where the words keep the field faint, nothing to work out.
      const strength = weight(frame, y, offsets[column] ?? 0)
      if (strength < FAINT) continue

      const value = blobs(
        grid.x0 + column * grid.dx + pushAt(warp.x, warp.across, column, row),
        grid.y0 + row * grid.dy + pushAt(warp.y, warp.across, column, row),
        evolve
      )
      if (value < THRESHOLD) continue

      // The glyph changes only as the field carries its value across a step,
      // so changes travel with the blobs instead of flickering.
      const isDense = value > DENSE
      const count = isDense ? sprites.dense : sprites.sparse
      const pick = Math.floor((value * 9 + hash(column, row, seed)) * count) % count
      const alpha = smoothstep(THRESHOLD, THRESHOLD + EDGE, value) * strength
      if (alpha < FAINT) continue
      const sprite = isDense ? pick : sprites.dense + pick
      stamp(raster, sprites, sprite, column * cellWidth + cellWidth / 2, y, alpha)
    }
  }
}
