import { expect, openPage, openView, test } from './fixtures'

/**
 * Frame parity by MEASUREMENT, not by pixel diff.
 *
 * The issue asked for a tolerance-based screenshot diff against Figma
 * exports. That is the obvious way to do this and it is the wrong one here:
 * Figma and Chromium rasterise type differently, so a diff against an export
 * is either so tolerant it catches nothing or so strict it fails on
 * antialiasing. Every real geometry bug this project has had — the tab 22px
 * too wide, the search field 70px too narrow, the tab rule stopping short of
 * the sidebar — was found by measuring a specific anchor against a specific
 * Figma number, and each of those diagnoses names the thing that moved.
 *
 * A pixel diff says "3% differs". This says "the search field is at 709 and
 * the frame puts it at 713".
 *
 * The numbers are read off the frames and recorded here. Where the app
 * deliberately departs from a frame — Karan's 14px menu type, the 48px
 * chrome — the anchor is the app's own decision and is commented as such,
 * because a parity test that silently encodes a departure is worse than none.
 */

/** Chrome is drawn at 1440 in every frame. */
const VIEWPORT = { width: 1440, height: 1024 }

interface Anchor {
  what: string
  /** Runs in the page; returns the measured number. */
  measure: string
  expected: number
  /** Text rasterises differently between Figma and Chromium. */
  tolerance?: number
}

const CHROME: Anchor[] = [
  {
    what: 'sidebar width (80:340)',
    measure: `document.querySelector('.sidebar').getBoundingClientRect().width`,
    expected: 58
  },
  {
    what: 'footer height (93:3)',
    measure: `document.querySelector('.footer').getBoundingClientRect().height`,
    expected: 32
  },
  {
    what: 'pane starts at the sidebar edge',
    measure: `document.querySelector('.app-shell-pane').getBoundingClientRect().left`,
    expected: 58
  },
  {
    what: 'menu bar height (app decision: 48, frame 81:2 draws 62)',
    measure: `document.querySelector('.menu-bar').getBoundingClientRect().height`,
    expected: 48
  },
  {
    what: 'File text left (81:59)',
    measure: `document.querySelector('.menu-bar-menu').getBoundingClientRect().left + 8`,
    expected: 94
  }
]

const TAB_STRIP: Anchor[] = [
  {
    what: 'tab bar flush with the sidebar (118:8)',
    measure: `document.querySelector('.tab-bar').getBoundingClientRect().left`,
    expected: 58
  },
  {
    what: 'tab bar spans the pane',
    measure: `document.querySelector('.tab-bar').getBoundingClientRect().right`,
    expected: 1440
  },
  {
    what: 'tab height (118:2)',
    measure: `document.querySelector('.tab').getBoundingClientRect().height`,
    expected: 34
  },
  {
    what: 'new-tab button (122:4)',
    measure: `document.querySelector('.tab-bar-new').getBoundingClientRect().width`,
    expected: 34
  },
  {
    what: 'pane body inset (pane-header at 24,20 inside pane-content)',
    measure: `document.querySelector('.pane-body').getBoundingClientRect().left`,
    expected: 58
  }
]

const HOME: Anchor[] = [
  {
    what: 'title left (40:242)',
    measure: `document.querySelector('.home-title').getBoundingClientRect().left`,
    expected: 114
  },
  {
    what: 'title top (40:242)',
    measure: `document.querySelector('.home-title').getBoundingClientRect().top`,
    expected: 118,
    tolerance: 14
  },
  {
    what: 'changelog left (40:295)',
    measure: `document.querySelector('.home-changelog').getBoundingClientRect().left`,
    expected: 841.6,
    tolerance: 2
  },
  {
    what: 'changelog width (40:295)',
    measure: `document.querySelector('.home-changelog').getBoundingClientRect().width`,
    expected: 238
  },
  {
    what: 'guide card width (71:188)',
    measure: `document.querySelector('.home-guide-card').getBoundingClientRect().width`,
    expected: 388,
    tolerance: 2
  }
]

async function assertAnchors(
  window: import('@playwright/test').Page,
  anchors: readonly Anchor[]
): Promise<void> {
  const measured: Record<string, number> = {}
  for (const anchor of anchors) {
    measured[anchor.what] = Number(await window.evaluate(anchor.measure))
  }

  const off = anchors
    .filter(
      (anchor) => Math.abs((measured[anchor.what] ?? 0) - anchor.expected) > (anchor.tolerance ?? 1)
    )
    .map(
      (anchor) =>
        `${anchor.what}: expected ${String(anchor.expected)}, got ${(measured[anchor.what] ?? 0).toFixed(1)}`
    )

  expect(off, off.join('\n')).toEqual([])
}

test.describe('frame parity', () => {
  test('the chrome sits where the frames put it', async ({ window }) => {
    await window.setViewportSize(VIEWPORT)
    await assertAnchors(window, CHROME)
  })

  test('Home matches 2:3', async ({ window }) => {
    await window.setViewportSize(VIEWPORT)
    await assertAnchors(window, HOME)
  })

  test('the tab strip matches 118:7, flush to the sidebar', async ({ window }) => {
    await window.setViewportSize(VIEWPORT)
    await openPage(window, 'Data Explorer')
    await openView(window, 'Prices')
    await assertAnchors(window, TAB_STRIP)
  })

  test('the type scale actually reaches the app', async ({ window }) => {
    // BU-38: type.css was imported only by Storybook, so `type-11` resolved
    // to nothing in the app while Storybook rendered it correctly. tsc, lint
    // and 700 unit tests all passed. This is the assertion that would have
    // caught it — a computed style, from a real element, in the real app.
    await openPage(window, 'Data Explorer')

    const computed = await window.evaluate(() => {
      const element = document.querySelector('.type-11')
      if (element === null) return null
      const style = getComputedStyle(element)
      return { size: style.fontSize, family: style.fontFamily }
    })

    expect(computed, 'no .type-11 element on screen to check').not.toBeNull()
    expect(computed?.size).toBe('11px')
    expect(computed?.family).toContain('Inter')
  })

  test('the theme toggle knob sits centred in its track', async ({ window }) => {
    // It sat 2.5px from the top and 0.5px from the bottom: a 0.5px BORDER
    // rounds up to a whole device pixel and shrinks the padding box the knob
    // is absolutely positioned inside, so the inset stopped meaning what it
    // said. Measured, because 2px is exactly the kind of wrong that is
    // obvious on screen and invisible to every other check.
    const gaps = await window.evaluate(() => {
      const track = document.querySelector('.theme-toggle')?.getBoundingClientRect()
      const knob = document.querySelector('.theme-toggle-knob')?.getBoundingClientRect()
      if (track === undefined || knob === undefined) return null
      return { top: knob.top - track.top, bottom: track.bottom - knob.bottom }
    })

    expect(gaps, 'no theme toggle on screen to measure').not.toBeNull()
    expect(gaps?.top).toBeCloseTo(gaps?.bottom ?? -1, 1)
  })

  test('platform-drawn controls follow the theme, and the 4px scrollbar survives', async ({
    window
  }) => {
    /*
     * BU-74. `Select` wraps a real `<select>`, so its option list is drawn by
     * the platform and takes its palette from `color-scheme` — which was
     * never declared, so every dropdown opened white in dark mode. The popup
     * is a widget outside the page and no screenshot can reach it; the
     * computed scheme is the mechanism, and it IS observable.
     *
     * The scrollbar is measured in the same test on purpose. `app.css` warns
     * that `scrollbar-color` makes Chromium 121+ drop the `::-webkit-` rules
     * and take the 4px with them; `color-scheme` is a different property and
     * does not, but that is exactly the kind of thing to assert rather than
     * believe.
     */
    await openPage(window, 'Data Explorer')
    await openView(window, 'Prices')
    await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
    await window.keyboard.press('Enter')
    await window.locator('.tbl-row').first().waitFor()

    const read = async (): Promise<{ scheme: string; scrollbar: number }> =>
      window.evaluate(() => {
        const body = document.querySelector('.tbl-body')
        return {
          scheme: getComputedStyle(document.documentElement).colorScheme,
          scrollbar:
            body === null
              ? -1
              : body.clientWidth === 0
                ? -1
                : (body as HTMLElement).offsetWidth - body.clientWidth
        }
      })

    expect(await read()).toEqual({ scheme: 'light', scrollbar: 4 })

    await window.getByRole('switch', { name: 'Dark mode' }).click()
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')

    expect(await read()).toEqual({ scheme: 'dark', scrollbar: 4 })
  })

  test('the bundled faces are the ones painting, not system fallbacks', async ({ window }) => {
    // BU-52: Roboto resolved off the developer's machine and fell back to
    // Inter — 5% wider — everywhere it was not installed. Three machines,
    // three menu bars.
    const faces = await window.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => `${face.family} ${face.weight} ${face.style}`)
    )

    expect(faces).toContain('Inter 400 normal')
    expect(faces).toContain('Roboto 400 normal')
  })
})
