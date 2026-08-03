import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TAB_GEOMETRY } from './tabGeometry'

const CSS = readFileSync(join(__dirname, 'Tab.css'), 'utf-8')

function customProperty(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS)?.[1]?.trim()
}

/** The `.tab-close` rule body, so assertions cannot match a neighbouring rule. */
function closeRule(): string {
  return /^\.tab-close\s*\{([^}]*)\}/m.exec(CSS)?.[1] ?? ''
}

describe('tab geometry', () => {
  it('declares the Figma values in CSS, once each', () => {
    // The point of the custom properties is that the numbers appear in one
    // place. If someone re-hardcodes 14px into a padding rule this keeps
    // pointing at the source of truth, and the mismatch shows up here.
    expect(customProperty('tab-height')).toBe(`${String(TAB_GEOMETRY.height)}px`)
    expect(customProperty('tab-pad-x')).toBe(`${String(TAB_GEOMETRY.paddingX)}px`)
    expect(customProperty('tab-gap')).toBe(`${String(TAB_GEOMETRY.gap)}px`)
    expect(customProperty('tab-underline')).toBe(`${String(TAB_GEOMETRY.underline)}px`)
    expect(customProperty('tab-dirty-size')).toBe(`${String(TAB_GEOMETRY.dirtySize)}px`)
  })

  /**
   * The BU-51 regression, and the only one that actually changes widths.
   *
   * In flow, the close button was 14px wide with an 8px margin — 22px on
   * every tab, for a control the Figma component does not contain. A 74px
   * `TECH10` rendered at 96px. Nothing about the padding was wrong, so
   * adjusting padding could never have fixed it.
   */
  it('keeps the close affordance out of the layout', () => {
    const rule = closeRule()

    expect(rule).toMatch(/position:\s*absolute/)
    // A margin here would put the width back, quietly.
    expect(rule).not.toMatch(/margin/)
  })

  it('gives the close button a hit target no smaller than 16px', () => {
    // Smaller than this and it is a nuisance to hit, however tidy it looks.
    const hit = customProperty('tab-close-hit')
    expect(hit).toBeDefined()
    expect(Number.parseFloat(hit ?? '0')).toBeGreaterThanOrEqual(16)
  })

  it('draws the glyph smaller than its hit target', () => {
    const glyph = Number.parseFloat(customProperty('tab-close-glyph') ?? '0')
    const hit = Number.parseFloat(customProperty('tab-close-hit') ?? '0')

    expect(glyph).toBeGreaterThan(0)
    expect(glyph).toBeLessThan(hit)
  })
})
