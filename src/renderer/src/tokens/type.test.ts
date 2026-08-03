import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const TOKENS = resolve(__dirname)
const RENDERER = resolve(__dirname, '..')

const TYPE_CSS = readFileSync(join(TOKENS, 'type.css'), 'utf-8')
const APP_CSS = readFileSync(join(RENDERER, 'app.css'), 'utf-8')

/** Class names type.css actually defines a rule for. */
function definedClasses(css: string): Set<string> {
  return new Set([...css.matchAll(/^\.([\w-]+)\s*\{/gm)].map((match) => match[1] ?? ''))
}

/**
 * Every `type-*` / `tabular` class named in a component, stories excluded.
 *
 * Occurrences rather than distinct names: the app leans on just `type-11` and
 * `type-13`, so a distinct-name count is a two-digit-sized signal that cannot
 * tell "the scan broke" from "the app is austere".
 */
function usedClasses(): { name: string; file: string }[] {
  const used: { name: string; file: string }[] = []
  const files = readdirSync(RENDERER, { recursive: true, encoding: 'utf-8' })

  for (const file of files) {
    if (!file.endsWith('.tsx') || file.includes('stories')) continue
    const source = readFileSync(join(RENDERER, file), 'utf-8')
    for (const match of source.matchAll(/\b(type-[\w-]+|tabular)\b/g)) {
      used.push({ name: match[0], file })
    }
  }
  return used
}

/**
 * The regression this file exists for (BU-38).
 *
 * `type.css` was imported only by `.storybook/preview.ts` for most of the
 * project's life. Storybook rendered the type scale correctly and the app
 * rendered none of it — 72 uses of `type-11` and `type-13` across 35
 * components resolving to no rule at all. Nothing failed: not tsc, not lint,
 * not any test, and not a Storybook screenshot. Only the app was wrong.
 */
describe('type scale', () => {
  it('reaches the app, not just Storybook', () => {
    expect(APP_CSS).toMatch(/@import\s+'\.\/tokens\/type\.css'/)
  })

  it('defines every class the components ask for', () => {
    const used = usedClasses()
    // Without this the check passes vacuously the moment the scan breaks —
    // which would recreate the exact silence that let the bug live this long.
    expect(used.length).toBeGreaterThan(50)

    const defined = definedClasses(TYPE_CSS)
    const missing = used
      .filter(({ name }) => !defined.has(name))
      .map(({ name, file }) => `${name} (${file})`)

    expect(missing).toEqual([])
  })

  it('bundles the faces rather than fetching them', () => {
    // The CSP is `default-src 'self'` and the app has to work offline, so a
    // remote src would fail silently and fall back to a system face.
    const sources = [...TYPE_CSS.matchAll(/src:\s*url\('([^']+)'\)/g)].map((match) => match[1])

    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      expect(source).toMatch(/^\.\.\/assets\/fonts\//)
    }
  })

  it('declares a face for each weight the scale uses', () => {
    // A `font-weight: 500` with no 500 face loads the 400 and lets the
    // renderer synthesise a bold — which is not what Figma measured.
    const faces = [...TYPE_CSS.matchAll(/@font-face\s*\{[^}]*\}/g)].map((match) => match[0])
    const declared = new Set(
      faces.map((face) => {
        const family = /font-family:\s*'([^']+)'/.exec(face)?.[1]
        const weight = /font-weight:\s*(\d+)/.exec(face)?.[1]
        const style = /font-style:\s*(\w+)/.exec(face)?.[1]
        return `${String(family)} ${String(weight)} ${String(style)}`
      })
    )

    expect(declared).toEqual(
      new Set([
        'Inter 400 normal',
        'Inter 500 normal',
        'Source Serif Pro 600 italic',
        // Window chrome only, and bundled for the reason BU-52 found: it was
        // resolving off the local machine and falling back to Inter — 5%
        // wider — anywhere it was not installed.
        'Roboto 400 normal'
      ])
    )
  })

  it('gives the chrome its own family, separate from the UI stack', () => {
    // If --font-chrome ever collapses into --font-ui the menu bar silently
    // goes back to being 5% wide, which is a hard symptom to trace back.
    const chrome = /--font-chrome:\s*([^;]+);/.exec(TYPE_CSS)?.[1]
    expect(chrome).toMatch(/^'Roboto'/)
  })
})
