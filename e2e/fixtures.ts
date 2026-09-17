import { join } from 'node:path'
import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { startStubEngine, type StubEngine } from './stubEngine'

export interface BeaconFixtures {
  app: ElectronApplication
  /** The main window, already past the splash and on Home. */
  window: Page
  engine: StubEngine
}

const ROOT = join(__dirname, '..')

/**
 * A real Electron app, a stub engine, and a clean profile per test.
 *
 * `BEACON_SERVER_URL` makes the engine attach rather than spawn, so no python
 * is involved and the data is identical every run. `BEACON_NO_SYNTHETIC`
 * belts that: with an external server there is nothing to generate, and a
 * test that quietly wrote a 512-asset store into the developer's app-data
 * directory would be a nasty surprise.
 *
 * `--user-data-dir` per worker is what makes the tests independent. Without
 * it they share a persisted workspace and the second test sees whatever the
 * first left open.
 */
/**
 * Wait for the window whose URL `wants` accepts.
 *
 * Polled rather than `waitForEvent`, which only sees windows created after it
 * attaches: the one being waited for is usually already open, and a missed
 * event never replays.
 */
async function windowFor(
  app: ElectronApplication,
  wants: (url: string) => boolean,
  what: string
): Promise<Page> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const found = app.windows().find((candidate) => wants(candidate.url()))
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error(`${what} never appeared`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** `#splash` and `#settings` are hashes off one entry; the app itself has none. */
const isSplash = (url: string): boolean => url.includes('#splash')
const isApp = (url: string): boolean => url !== '' && !url.includes('#')

/** The splash, whether or not it won the race to be created first. */
export async function splashWindow(app: ElectronApplication): Promise<Page> {
  return windowFor(app, isSplash, 'the splash')
}

/** The app window, which exists from launch but stays hidden until Start. */
export async function appWindow(app: ElectronApplication): Promise<Page> {
  return windowFor(app, isApp, 'the app window')
}

export const test = base.extend<BeaconFixtures>({
  // Playwright reads the destructuring pattern to work out which fixtures this
  // one depends on. `{}` is how you say "none" — an unused identifier there
  // would be read as depending on everything, so the rule is wrong here.
  // eslint-disable-next-line no-empty-pattern
  engine: async ({}, use) => {
    /*
     * A live engine instead of the fake, when asked (BU-206).
     *
     * `BEACON_LIVE_URL` points the fidelity suite at a running py-beacon, so
     * every claim the stub is built on is checked against the thing it
     * mirrors rather than against itself. Karan chose this over schema
     * validation because all four of our stub-fidelity failures were
     * schema-VALID payloads describing behaviour the engine no longer had —
     * shape was never the problem.
     *
     * Only `stubFidelity.spec.ts` is meaningful this way: every other file
     * asserts fixture VALUES, which a real store does not have.
     */
    const live = process.env.BEACON_LIVE_URL
    if (live !== undefined && live !== '') {
      await use({
        url: live,
        token: process.env.BEACON_API_TOKEN ?? '',
        skipUniverses: () => undefined,
        close: () => Promise.resolve()
      })
      return
    }

    const engine = await startStubEngine()
    await use(engine)
    await engine.close()
  },

  app: async ({ engine }, use, testInfo) => {
    const app = await electron.launch({
      args: [ROOT, `--user-data-dir=${testInfo.outputPath('profile')}`],
      env: {
        ...process.env,
        BEACON_SERVER_URL: engine.url,
        // Only set against a live engine; the stub does not check it.
        ...(engine.token === '' ? {} : { BEACON_API_TOKEN: engine.token }),
        BEACON_NO_SYNTHETIC: '1',
        // Nothing should reach GitHub from a test run.
        BEACON_NO_UPDATE: '1'
      }
    })
    await use(app)
    await app.close()
  },

  window: async ({ app }, use) => {
    /*
     * The splash comes first and waits to be started (BU-111, BU-115).
     *
     * Found by URL, not by `firstWindow()`. Both windows are created in the
     * same tick, so which one arrives first is a race — and when it came back
     * as the main window the test skipped Start entirely and drove a window
     * that was still hidden. That was survivable while the engine started on
     * its own; now that Start IS the startup, it means driving an app with no
     * engine behind it, which showed up as data that never arrived.
     */
    const splash = await windowFor(app, isSplash, 'the splash')
    await splash.getByRole('button', { name: 'Start' }).click({ timeout: 30_000 })
    const window = await windowFor(app, isApp, 'the app window')

    await window.waitForSelector('.app-shell')
    // Fonts settle before anything is measured or screenshotted; a metric
    // taken mid-swap is a metric of the fallback face.
    await window.evaluate(() => document.fonts.ready)
    await use(window)
  }
})

export { expect } from '@playwright/test'

/** Leave Home for a sidebar page and wait for its pane. */
export async function openPage(window: Page, label: string): Promise<void> {
  await window.getByRole('button', { name: label, exact: true }).click()
  await window.waitForSelector('.pane-host')
}

/** Open a view from the `+` menu on the current page. */
export async function openView(window: Page, title: string): Promise<void> {
  await window.getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: title, exact: true }).click()
}

/**
 * Choose from a `Select` (BU-196).
 *
 * The control draws its own list now rather than hiding a native `<select>`,
 * so Playwright's `selectOption` no longer applies — it speaks to a real
 * `<select>` element and there is not one. Opening and clicking is what a
 * user does, and it exercises the popup that replaced it, which the old
 * call never touched.
 *
 * `name` matches the control's `aria-label`; `value` is the option's stored
 * value, so a call reads the same as the `selectOption` it replaced and does
 * not break when a display label is reworded.
 */
export async function choose(window: Page, name: string, value: string): Promise<void> {
  await window.getByRole('combobox', { name, exact: true }).click()
  await window
    .getByRole('listbox', { name, exact: true })
    .locator(`[role="option"][data-value="${value}"]`)
    .click()
}

/**
 * Open a `Select` and hand back its list, for a test that inspects the
 * options before choosing — which is most of what `option` locators used to
 * do against the native element. The options exist only while it is open.
 */
export async function openSelect(window: Page, name: string): Promise<Locator> {
  await window.getByRole('combobox', { name, exact: true }).click()
  return window.getByRole('listbox', { name, exact: true })
}

/** The same, for the few places that know an option by its text. */
export async function chooseLabel(window: Page, name: string, label: string): Promise<void> {
  await window.getByRole('combobox', { name, exact: true }).click()
  await window
    .getByRole('listbox', { name, exact: true })
    .getByRole('option', { name: label, exact: true })
    .click()
}
