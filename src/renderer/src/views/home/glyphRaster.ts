/*
 * The glyph field's pixels, built in memory and handed to the canvas once a
 * frame. A header card holds some six thousand glyphs: drawn one call at a
 * time, as text or as copies from a sprite sheet, they took most of each
 * frame on a machine without a GPU, which froze the page and then, once the
 * field slowed itself, left it stepping (Karan, 2026-10-19). Writing pixels
 * in a plain array costs the same with or without one.
 */

/** A glyph's size in CSS pixels. The site's 4px at its 1.5 card scale. */
export const SIZE = 6
const FACE = '"Times New Roman", Times, Georgia, serif'

export interface Inks {
  /** The dense parts of the field. */
  strong: string
  /** Its edges. */
  soft: string
}

/**
 * One glyph as the pixels it inks, which are a third of its square: the
 * rest is not worth visiting. Each is its place in the square (row * cell +
 * column), its colour packed as ImageData holds it with no alpha, and how
 * much it covers.
 */
interface Sprite {
  inked: Uint16Array
  colour: Uint32Array
  cover: Float32Array
}

/** Every glyph drawn once, in its ink, at the screen's pixel ratio. */
export interface GlyphSprites {
  /** The capitals, in the strong ink, then the lower case, in the soft. */
  list: readonly Sprite[]
  /** One glyph's square, in device pixels. */
  cell: number
  ratio: number
  dense: number
  sparse: number
}

/** A frame's pixels, and the same memory a whole pixel at a time. */
export interface Raster {
  image: ImageData
  words: Uint32Array
}

export function rasterOf(image: ImageData): Raster {
  return { image, words: new Uint32Array(image.data.buffer) }
}

/** Capitals fill the dense parts of the field, lower case its edges. */
export function glyphSprites(glyphs: readonly string[], inks: Inks, ratio: number): GlyphSprites {
  const capitals = glyphs.filter((glyph) => glyph !== glyph.toLowerCase())
  const lower = glyphs.filter((glyph) => glyph === glyph.toLowerCase())
  const dense = capitals.length > 0 ? capitals : glyphs
  const sparse = lower.length > 0 ? lower : glyphs
  const cell = Math.ceil(SIZE * ratio)
  const none = { list: [], cell, ratio, dense: 0, sparse: 0 }

  const sheet = document.createElement('canvas')
  sheet.width = cell
  sheet.height = cell
  const context = sheet.getContext('2d', { willReadFrequently: true })
  if (context === null) return none
  context.font = `italic ${String(SIZE * ratio)}px ${FACE}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const draw = (glyph: string, ink: string): Sprite | undefined => {
    context.clearRect(0, 0, cell, cell)
    context.fillStyle = ink
    context.fillText(glyph, cell / 2, cell / 2)
    const pixels = context.getImageData(0, 0, cell, cell).data
    // A canvas that draws nothing (the tests' stub) hands back a token array.
    return pixels.length < cell * cell * 4 ? undefined : spriteOf(pixels)
  }
  const list = [
    ...dense.map((glyph) => draw(glyph, inks.strong)),
    ...sparse.map((glyph) => draw(glyph, inks.soft))
  ].filter((sprite) => sprite !== undefined)
  if (list.length < dense.length + sparse.length) return none
  return { list, cell, ratio, dense: dense.length, sparse: sparse.length }
}

function spriteOf(pixels: Uint8ClampedArray): Sprite {
  const words = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.length / 4)
  const inked: number[] = []
  for (let at = 0; at < words.length; at++) {
    if ((pixels[at * 4 + 3] ?? 0) > 0) inked.push(at)
  }
  return {
    inked: Uint16Array.from(inked),
    colour: Uint32Array.from(inked, (at) => (words[at] ?? 0) & 0xffffff),
    cover: Float32Array.from(inked, (at) => (pixels[at * 4 + 3] ?? 0) / 255)
  }
}

/**
 * Lays sprite `index` over the frame centred on (x, y) in CSS pixels, at
 * `alpha`. Most pixels it meets are still clear, and those it writes whole;
 * neighbouring glyphs overlap by a pixel, and there it blends.
 */
export function stamp(
  raster: Raster,
  sprites: GlyphSprites,
  index: number,
  x: number,
  y: number,
  alpha: number
): void {
  const sprite = sprites.list[index]
  if (sprite === undefined) return
  const { cell, ratio } = sprites
  const { width, height } = raster.image
  const left = Math.round(x * ratio - cell / 2)
  const top = Math.round(y * ratio - cell / 2)
  const inside = left >= 0 && top >= 0 && left + cell <= width && top + cell <= height

  for (let k = 0; k < sprite.inked.length; k++) {
    const at = sprite.inked[k] ?? 0
    const row = Math.floor(at / cell)
    const px = left + at - row * cell
    const py = top + row
    // Only a glyph on the card's edge has pixels to clip.
    if (!inside && (px < 0 || py < 0 || px >= width || py >= height)) continue
    const target = py * width + px
    const colour = sprite.colour[k] ?? 0
    const over = (sprite.cover[k] ?? 0) * alpha
    if (raster.words[target] === 0) {
      raster.words[target] = colour | (Math.round(over * 255) << 24)
      continue
    }
    blend(raster.image.data, target * 4, colour, over)
  }
}

/** Source-over, unpremultiplied, as ImageData holds its pixels. */
function blend(into: Uint8ClampedArray, at: number, colour: number, over: number): void {
  const under = (into[at + 3] ?? 0) / 255
  const kept = under * (1 - over)
  const total = over + kept
  for (let channel = 0; channel < 3; channel++) {
    const source = (colour >>> (channel * 8)) & 0xff
    into[at + channel] = (source * over + (into[at + channel] ?? 0) * kept) / total
  }
  into[at + 3] = total * 255
}
