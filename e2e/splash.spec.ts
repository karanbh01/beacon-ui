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
      BEACON_NO_SYNTHETIC: '1',
      BEACON_NO_UPDATE: '1'
    }
  })
}

test('both buttons are outside the drag region, or they cannot be clicked', async ({
  engine
}, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)
  await splash.getByRole('button', { name: 'Start' }).waitFor()

  /*
   * The one failure a click test cannot catch.
   *
   * The whole splash surface is a drag region, and on one the OS takes a
   * press as "move the window" before the renderer sees a click. Start and
   * Data settings shipped without opting out and were dead to the mouse,
   * while the tests below — which click both — kept passing: Playwright
   * dispatches input through the debugger, which never consults the
   * drag-region hit test. So this asks the computed style instead.
   */
  const regions = await splash.evaluate(() =>
    [...document.querySelectorAll('.splash-actions button')].map((button) =>
      getComputedStyle(button).getPropertyValue('-webkit-app-region')
    )
  )

  expect(regions).toEqual(['no-drag', 'no-drag'])
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

test('opens data settings, and closes back to the splash', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await splashWindow(app)

  await splash.getByRole('button', { name: 'Data settings…' }).click()

  /*
   * Polled rather than `waitForEvent`.
   *
   * The window can be created before the listener attaches, and a missed
   * event never replays — which showed up as a pass alone and a failure
   * under full-suite load, the signature of exactly that race.
   */
  await expect
    .poll(() => app.windows().some((candidate) => candidate.url().includes('#settings')), {
      timeout: 30_000
    })
    .toBe(true)
  const settings = app.windows().find((candidate) => candidate.url().includes('#settings'))
  if (settings === undefined) throw new Error('the settings window did not open')

  await expect(settings.getByRole('textbox', { name: 'Store location' })).toBeVisible()
  // Nothing changed, so there is nothing to save.
  await expect(settings.getByRole('button', { name: 'Save and restart' })).toBeDisabled()

  /*
   * Replacing the data lives here too (BU-116).
   *
   * Reached from the splash, this is the one moment a rebuild is free: the
   * app has not started, so there is nothing to interrupt. Only the offer is
   * exercised — accepting it deletes the store and takes minutes, and main
   * asks through the OS dialog, which a test must not be answering.
   */
  await expect(settings.getByRole('button', { name: 'Replace the data…' })).toBeEnabled()

  await settings.getByRole('textbox', { name: 'Store location' }).fill('D:/mine')
  // Still enabled: it follows what is SAVED, and nothing has been saved.
  await expect(settings.getByRole('button', { name: 'Replace the data…' })).toBeEnabled()

  await settings.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => app.windows().some((c) => c.url().includes('#settings'))).toBe(false)
  await expect(splash.getByRole('button', { name: 'Start' })).toBeVisible()

  await app.close()
})
