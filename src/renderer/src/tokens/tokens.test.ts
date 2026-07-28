import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLORS, RAW, cssVar, type ColorToken } from './tokens'

const CSS = readFileSync(resolve(__dirname, 'tokens.css'), 'utf-8')
const MODES = ['light', 'dark'] as const

/**
 * Every token BU-4 names explicitly. Listed literally rather than derived from
 * COLORS, so deleting a token from colors.json fails here instead of silently
 * shrinking the contract.
 */
const REQUIRED: ColorToken[] = [
  'canvas',
  'surface',
  'border',
  'divider',
  'text-primary',
  'text-secondary',
  'text-muted',
  'accent',
  'success',
  'danger',
  'sidebar-active-bg',
  'chrome-border',
  'chrome-search-bg',
  'chrome-search-stroke',
  'series-2',
  'series-3',
  // Bound in Figma but absent from BU-4's list, which named only 14 of 24.
  'chrome-icon',
  'chrome-text',
  'info-text',
  'info-bg',
  'status-done-text',
  'status-done-bg',
  'status-running-text',
  'status-running-bg',
  'status-failed-text',
  'status-failed-bg'
]

/** Figma exports translucent variables with an alpha pair, e.g. #fbf3e233. */
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

describe('token contract', () => {
  it('defines every required token in both modes', () => {
    for (const mode of MODES) {
      for (const token of REQUIRED) {
        expect(COLORS[mode][token], `${mode}/${token}`).toMatch(HEX)
      }
    }
  })

  it('carries series-2 and series-3 so compare lines stop borrowing success/danger', () => {
    for (const mode of MODES) {
      expect(COLORS[mode]['series-2']).not.toBe(COLORS[mode].success)
      expect(COLORS[mode]['series-3']).not.toBe(COLORS[mode].danger)
    }
  })

  it('gives light and dark genuinely different values for surface colours', () => {
    for (const token of ['canvas', 'surface', 'text-primary'] as const) {
      expect(COLORS.light[token]).not.toBe(COLORS.dark[token])
    }
  })

  it('preserves alpha on the translucent tokens', () => {
    // surface and chrome-search-bg are washes over canvas in Figma, not opaque
    // fills. Dropping the alpha pair would flatten them into solid blocks.
    for (const token of ['surface', 'chrome-search-bg'] as const) {
      expect(COLORS.light[token], token).toHaveLength(9)
    }
  })
})

describe('generated css', () => {
  it('emits a block per mode plus an unthemed fallback', () => {
    expect(CSS).toContain(":root[data-theme='light']")
    expect(CSS).toContain(":root[data-theme='dark']")
    expect(CSS).toMatch(/^\/\* GENERATED[\s\S]*?\n:root \{/m)
  })

  it('declares every token in every mode block', () => {
    for (const token of REQUIRED) {
      const declarations = CSS.match(new RegExp(`--${token}:`, 'g')) ?? []
      // One per mode, plus the fallback :root block.
      expect(declarations, token).toHaveLength(MODES.length + 1)
    }
  })

  it('declares no heatmap custom property, since the colormap must not flip by mode', () => {
    expect(CSS).not.toMatch(/--heatmap-/)
  })
})

describe('raw colormap', () => {
  it('does not collide with any themed token', () => {
    // A compare line sharing a hex with a heatmap cell would read as one.
    const themed = MODES.flatMap((mode) => Object.values(COLORS[mode]))
    for (const [name, value] of Object.entries(RAW)) {
      expect(themed, name).not.toContain(value)
    }
  })
})

describe('cssVar', () => {
  it('builds a custom property reference', () => {
    expect(cssVar('accent')).toBe('var(--accent)')
    expect(cssVar('sidebar-active-bg')).toBe('var(--sidebar-active-bg)')
  })
})
