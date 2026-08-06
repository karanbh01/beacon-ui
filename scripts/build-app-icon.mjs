// Generate the app icon from the beta-cube artwork (BU-73).
//
// The master is build/icon-source.png — Karan's artwork, used as-is. This
// only resizes it into the shapes each platform wants: a 1024px png for
// electron-builder to derive .icns from, and a real multi-size .ico for
// Windows.
//
//   pnpm run icon:build
//
// Resizing happens through Electron's nativeImage rather than an image
// library, because Electron is already a dependency and adding sharp would
// put a native build step in CI to resize one file.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, nativeImage } from 'electron'

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

app.whenReady().then(async () => {
  const source = nativeImage.createFromBuffer(await readFile(SOURCE))
  const { width, height } = source.getSize()
  if (width === 0) throw new Error(`could not read ${SOURCE}`)

  await mkdir(OUT, { recursive: true })

  // `quality: 'best'` is Lanczos rather than nearest — it matters most on the
  // downscales, where the cube's 4.5px edges have to survive reaching 16px.
  const at = (size) => source.resize({ width: size, height: size, quality: 'best' })

  await writeFile(join(OUT, 'icon.png'), at(MASTER).toPNG())
  await writeFile(join(OUT, 'icon@256.png'), at(256).toPNG())

  const frames = ICO_SIZES.map((size) => ({ size, png: at(size).toPNG() }))
  await writeFile(join(OUT, 'icon.ico'), encodeIco(frames))

  console.log(`[icon] source ${String(width)}x${String(height)}`)
  console.log(`[icon] wrote icon.png at ${String(MASTER)}px, icon@256.png`)
  console.log(`[icon] wrote icon.ico with ${ICO_SIZES.join(', ')}`)
  if (width < MASTER) {
    console.log(`[icon] NOTE: 1024 is upscaled from ${String(width)} — see #73`)
  }
  app.exit(0)
})
