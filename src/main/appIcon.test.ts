import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The app icon artefacts (BU-73).
 *
 * These are committed rather than built during packaging, so they can rot:
 * electron-builder reads `build/icon.ico`, and a missing or malformed one is
 * not a build failure — it is an app that ships with Electron's default icon
 * and nobody notices until it is installed. `pnpm icon:check` catches drift
 * from the artwork; this catches absence and corruption.
 */
const BUILD = join(__dirname, '..', '..', 'build')

/** Sizes the .ico is generated with — the taskbar, title bar and Explorer. */
const EXPECTED_SIZES = [16, 24, 32, 48, 64, 128, 256]

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Header is 6 bytes, then one 16-byte directory entry per frame. */
function icoSizes(file: string): number[] {
  const bytes = readFileSync(file)
  const count = bytes.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    // 0 means 256: the field is one byte and 256 does not fit in it.
    const width = bytes.readUInt8(6 + index * 16)
    return width === 0 ? 256 : width
  })
}

describe('the packaged icon', () => {
  it('keeps the artwork it is generated from', () => {
    // The master. Losing it would leave the derived files unreproducible.
    expect(existsSync(join(BUILD, 'icon-source.png'))).toBe(true)
  })

  it('is at least 512px, which is electron-builder’s floor for .icns', () => {
    const { width, height } = pngSize(join(BUILD, 'icon.png'))
    expect(width).toBe(height)
    expect(width).toBeGreaterThanOrEqual(512)
  })

  it('carries every size Windows asks for, in one .ico', () => {
    // 16 and 24 are the ones electron-builder's own derivation leaves out,
    // and they are the taskbar and the title bar.
    expect(icoSizes(join(BUILD, 'icon.ico'))).toEqual(EXPECTED_SIZES)
  })

  it('stores its frames as PNG, which is what carries the alpha', () => {
    const bytes = readFileSync(join(BUILD, 'icon.ico'))
    const offset = bytes.readUInt32LE(6 + 12)
    expect(bytes.subarray(offset + 1, offset + 4).toString()).toBe('PNG')
  })
})
