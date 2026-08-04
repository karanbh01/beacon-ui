import { join } from 'node:path'
import {
  _electron as electron,
  test as base,
  type ElectronApplication,
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
export const test = base.extend<BeaconFixtures>({
  // Playwright reads the destructuring pattern to work out which fixtures this
  // one depends on. `{}` is how you say "none" — an unused identifier there
  // would be read as depending on everything, so the rule is wrong here.
  // eslint-disable-next-line no-empty-pattern
  engine: async ({}, use) => {
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
        BEACON_NO_SYNTHETIC: '1',
        // Nothing should reach GitHub from a test run.
        BEACON_NO_UPDATE: '1'
      }
    })
    await use(app)
    await app.close()
  },

  window: async ({ app }, use) => {
    // The splash is the first window and hands over once the engine answers;
    // waiting for a window WITHOUT the splash hash is what waits for the app.
    let window = await app.firstWindow()
    if (window.url().includes('#splash')) {
      window = await app.waitForEvent('window', {
        predicate: (candidate) => !candidate.url().includes('#splash')
      })
    }

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
