import { useEffect, useRef, type ReactElement } from 'react'
import { useThemeMode } from '../../state/theme'
import { drawField } from './glyphField'
import { glyphSprites, rasterOf, type Raster } from './glyphRaster'

/** The website's first card's letters; the Latin-looking capitals are left out. */
const GLYPHS = ['Σ', 'Ω', 'Π', 'ω', 'β', 'π']
const FRAMES_PER_SECOND = 30
const HALF_REFRESH = 8
/**
 * The most of the main thread the field may take. Home has nothing else to
 * run, so half; on a machine that cannot draw a frame in half the time
 * between frames, the field slows rather than freeze the page, as it once
 * did over remote desktop.
 */
const BUSY = 0.5
/** The moment a reader who asks for reduced motion sees, held still. */
const STILL = 4

/**
 * Home's header (Karan, 2026-10-19): the website's landing card, as wide as
 * the page, with Home and the date at its foot in the site's card face and
 * Greek glyphs drifting above them.
 */
export function HomeBanner({ date }: { date: string }): ReactElement {
  const card = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const words = useRef<HTMLDivElement>(null)
  const mode = useThemeMode()

  useEffect(() => {
    const box = card.current
    const surface = canvas.current
    const foot = words.current
    const context = surface?.getContext('2d')
    if (box == null || surface == null || foot == null || context == null) return undefined

    const inks = { strong: ink(box, '--glyph-strong'), soft: ink(box, '--glyph-soft') }
    let sprites = glyphSprites(GLYPHS, inks, window.devicePixelRatio || 1)
    let raster: Raster | undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const started = performance.now()
    let frame = 0
    let last = 0
    let interval = 1000 / FRAMES_PER_SECOND

    const draw = (): void => {
      if (raster === undefined) return
      const time = reduced.matches ? STILL : (performance.now() - started) / 1000
      drawField(
        raster,
        {
          width: box.clientWidth,
          height: box.clientHeight,
          wordsTop: foot.offsetTop,
          wordsBottom: foot.offsetTop + foot.offsetHeight,
          seed: 31
        },
        sprites,
        time
      )
      context.putImageData(raster.image, 0, 0)
    }

    const fit = (): void => {
      const ratio = window.devicePixelRatio || 1
      // A window dragged to a screen of another density wants its glyphs redrawn.
      if (sprites.ratio !== ratio) sprites = glyphSprites(GLYPHS, inks, ratio)
      surface.width = Math.round(box.clientWidth * ratio)
      surface.height = Math.round(box.clientHeight * ratio)
      // A card with no size, as in a hidden pane, has no pixels to hold.
      const image =
        surface.width > 0 && surface.height > 0
          ? context.createImageData(surface.width, surface.height)
          : undefined
      // The tests' canvas stub answers nothing.
      raster = image?.data === undefined ? undefined : rasterOf(image)
      draw()
    }

    const loop = (stamp: number): void => {
      frame = window.requestAnimationFrame(loop)
      if (reduced.matches || document.hidden) return
      // Within half a screen refresh: two refreshes measure a hair under
      // 33.3ms as often as over, and waiting for a third made it stutter.
      if (stamp - last < interval - HALF_REFRESH) return
      last = stamp
      const before = performance.now()
      draw()
      interval = Math.max(1000 / FRAMES_PER_SECOND, (performance.now() - before) / BUSY)
    }

    const resizer = new ResizeObserver(fit)
    resizer.observe(box)
    fit()
    frame = window.requestAnimationFrame(loop)
    return () => {
      resizer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [mode])

  return (
    <header ref={card} className="home-banner">
      <canvas ref={canvas} className="home-banner-field" aria-hidden="true" />
      <div ref={words} className="home-banner-words">
        <h1 className="home-banner-title">Home</h1>
        <p className="home-banner-date">{date}</p>
      </div>
    </header>
  )
}

/**
 * A custom property's colour as the canvas takes it, resolved through a
 * hidden probe. A color-mix() comes back as color(srgb r g b), which is
 * turned into rgba() as the site does, for a canvas that will not take it.
 */
function ink(card: HTMLElement, property: string): string {
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${property})`
  card.append(probe)
  const colour = getComputedStyle(probe).color
  probe.remove()

  const match = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(colour)
  if (match === null) return colour
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Math.round(Number(part) * 255))
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${match[4] ?? '1'})`
}
