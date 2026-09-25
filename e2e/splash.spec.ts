import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { expect, splashWindow, test } from './fixtures'

/**
 * The splash waits to be started (BU-111).
 *
 * A bare launch rather than the shared `app` fixture: that one presses Start
 * for every other test, and these are about what happens before it is.
 */
async function launch(engineUrl: string, profile: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    env: {
      ...process.env,
      BEACON_SERVER_URL: engineUrl,
      BEACON_NO_UPDATE: '1'
    }
  })
}

test('Start is outside the drag region, or it cannot be clicked', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)
  await splash.getByRole('button', { name: 'Start' }).waitFor()

  /*
   * The one failure a click test cannot catch.
   *
   * The whole splash surface is a drag region, and on one the OS takes a
   * press as "move the window" before the renderer sees a click. Start and
   * a Data settings button beside it shipped without opting out and were
   * dead to the mouse, while the tests below kept passing: Playwright
   * dispatches input through the debugger, which never consults the
   * drag-region hit test. So this asks the computed style instead.
   */
  const regions = await splash.evaluate(() =>
    [...document.querySelectorAll('.splash-actions button')].map((button) =>
      getComputedStyle(button).getPropertyValue('-webkit-app-region')
    )
  )

  expect(regions).toEqual(['no-drag'])
  await app.close()
})

test('starts nothing, and says nothing, until Start is pressed', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)
  await splash.getByRole('button', { name: 'Start' }).waitFor()

  // No bar at all (BU-116). An empty track with a caption under it still says
  // "this has begun"; no python has been spawned and no data generated.
  await expect(splash.getByRole('progressbar', { name: 'Startup' })).toHaveCount(0)

  // What happens after the press is the next test's business — and it is
  // over in a frame, since the hand-over closes this window.
  await app.close()
})

test('closing the splash leaves, rather than opening the app', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)
  await splash.getByRole('button', { name: 'Start' }).waitFor()

  const exited = app.waitForEvent('close')
  await splash.getByRole('button', { name: 'Close' }).click()
  await exited

  // The X used to hand over, so it opened the app — the opposite of what a
  // close button means, and impossible to undo once the splash had gone.
  expect(app.windows()).toHaveLength(0)
})

test('holds the app back until Start is pressed', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)

  // Enabled from the first frame now (BU-115): pressing it is what starts
  // the engine, so gating it on the engine would have been circular.
  await expect(splash.getByRole('button', { name: 'Start' })).toBeEnabled()

  /*
   * Asked of MAIN, not of the document.
   *
   * `document.visibilityState` reports "visible" inside a BrowserWindow that
   * has never been shown — the page has no idea the window is hidden, so it
   * is the wrong layer to ask. `isVisible()` is the fact.
   */
  const visibleBefore = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL(), on: w.isVisible() }))
  )
  expect(visibleBefore.filter((w) => !w.url.includes('#splash')).every((w) => !w.on)).toBe(true)

  await splash.getByRole('button', { name: 'Start' }).click()

  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (w) => w.isVisible() && !w.webContents.getURL().includes('#splash')
        )
      )
    )
    .toBe(true)

  await app.close()
})
