// Generate the app icon from the beta-cube artwork (BU-73).
//
// The master is build/icon-source.png — Karan's artwork, used as-is. This
// only reshapes it into what each platform wants: a square 1024px png for
// electron-builder to derive .icns from, and a real multi-size .ico for
// Windows.
//
//   pnpm run icon:build
//
// No image library: Electron is already a dependency, and adding sharp would
// put a native build step in CI to resize one file.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, nativeImage } from 'electron'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const SOURCE = join(ROOT, 'build', 'icon-source.png')
const OUT = join(ROOT, 'build')

/** electron-builder's floor for deriving .icns. */
const MASTER = 1024

/**
 * The sizes a .ico carries.
 *
 * 16 and 32 are the taskbar and title bar, 48 the alt-tab switcher, 256 the
 * large view in Explorer. Anything above 256 is not addressable in the ICO
 * format at all, which is why the master png exists separately.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * The artwork's own bounds, ignoring transparent surround.
 *
 * `toBitmap` hands back raw BGRA, so finding this needs no PNG decoder. It
 * matters because the supplied art is not square and does not sit centred on
 * its canvas — cropping to the ink first is what lets the square be built
 * around the CUBE rather than around whatever margin the export happened to
 * leave.
 */
function inkBounds(image) {
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // BGRA: alpha is the fourth byte of each pixel.
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) throw new Error('the artwork is entirely transparent')
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Centre the artwork in a square, letterboxed.
 *
 * `nativeImage.resize` to a square would STRETCH a 605x623 cube by 3% — small
 * enough to pass review and wrong. Compositing in a page is how the aspect
 * survives: `object-fit: contain` fits the long edge and centres the rest,
 * and the surround stays transparent.
 */
async function square(image, size) {
  const window = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })

  /*
   * `display: block` and `overflow: hidden` are both load-bearing.
   *
   * An `img` is inline, so it sits on a text baseline and the line box is a
   * few px taller than the image — which overflows a viewport sized to match
   * and makes Chromium paint SCROLLBARS, straight into the capture. That came
   * out as an opaque grey L along the bottom and right of the icon, on an
   * image that was otherwise correctly transparent.
   */
  const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body {
    margin: 0; width: ${size}px; height: ${size}px;
    background: transparent; overflow: hidden;
  }
  img { display: block; width: ${size}px; height: ${size}px; object-fit: contain; }
</style></head>
<body><img src="${image.toDataURL()}" /></body></html>`

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)

  /*
   * `loadURL` resolves on the DOCUMENT, not on the image inside it — so
   * capturing straight after it races the decode. That is not a theoretical
   * race: two runs produced two different PNGs and `icon:check` failed on its
   * own output. A lost race would be worse still, capturing a blank frame.
   *
   * `decode()` settles when the bitmap is ready to paint; one more frame after
   * it guarantees the paint has actually happened.
   */
  await window.webContents.executeJavaScript(
    `document.querySelector('img').decode().then(() =>
       new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))`
  )

  const shot = await window.webContents.capturePage()
  window.destroy()
  return shot
}

/**
 * A minimal ICO container over PNG-compressed frames.
 *
 * Written by hand because `nativeImage` has no .ico encoder and the format is
 * a 6-byte header plus a 16-byte directory entry per frame. PNG frames rather
 * than BMP: every Windows since Vista reads them, they are a third of the
 * size, and they carry alpha without the AND-mask dance BMP frames need.
 */
function encodeIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(frames.length, 4)

  const directory = Buffer.alloc(16 * frames.length)
  let offset = header.length + directory.length

  frames.forEach(({ size, png }, index) => {
    const at = index * 16
    // 256 is stored as 0 — the field is one byte and 256 does not fit.
    directory.writeUInt8(size >= 256 ? 0 : size, at)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1)
    directory.writeUInt8(0, at + 2) // palette size: 0 for truecolour
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)])
}

app.disableHardwareAcceleration()

/*
 * The compositing window is destroyed as soon as it has been captured, and
 * Electron's DEFAULT reaction to the last window closing is to quit. That
 * killed the run between writing icon.png and icon@256.png — silently, with
 * exit code 0, so it looked like the script had simply not run.
 */
app.on('window-all-closed', () => undefined)

/**
 * Without this the whole build is silent on failure: a rejection inside
 * `whenReady().then` is unhandled, Electron exits 0, and the only symptom is
 * that some of the files did not change. Cost half an hour once.
 */
async function main() {
  const source = nativeImage.createFromBuffer(await readFile(SOURCE))
  const { width, height } = source.getSize()
  if (width === 0) throw new Error(`could not read ${SOURCE}`)

  const ink = inkBounds(source)
  const master = await square(source.crop(ink), MASTER)

  await mkdir(OUT, { recursive: true })

  // Everything below comes off the SQUARE master, so each is square-to-square
  // and nothing is stretched twice. `quality: 'best'` is Lanczos rather than
  // nearest — it matters most on the downscales, where the cube's edges have
  // to survive reaching 16px.
  const at = (size) => master.resize({ width: size, height: size, quality: 'best' })

  await writeFile(join(OUT, 'icon.png'), master.toPNG())
  await writeFile(join(OUT, 'icon@256.png'), at(256).toPNG())
  await writeFile(
    join(OUT, 'icon.ico'),
    encodeIco(ICO_SIZES.map((s) => ({ size: s, png: at(s).toPNG() })))
  )

  console.log(`[icon] source ${String(width)}x${String(height)}`)
  console.log(
    `[icon] ink ${String(ink.width)}x${String(ink.height)} at ${String(ink.x)},${String(ink.y)}`
  )
  console.log(`[icon] wrote icon.png at ${String(MASTER)}px, icon@256.png`)
  console.log(`[icon] wrote icon.ico with ${ICO_SIZES.join(', ')}`)

  const longest = Math.max(ink.width, ink.height)
  if (longest < MASTER) {
    console.log(`[icon] NOTE: ${String(MASTER)} is upscaled from ${String(longest)} — see #73`)
  }
}

app.whenReady().then(
  async () => {
    await main()
    app.exit(0)
  },
  (error) => {
    console.error('[icon] failed:', error)
    app.exit(1)
  }
)
