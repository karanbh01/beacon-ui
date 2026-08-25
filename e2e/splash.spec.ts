import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { expect, test } from './fixtures'

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

test('holds the app back until Start is pressed', async ({ engine }, testInfo) => {
  const app = await launch(engine.url, testInfo.outputPath('profile'))
  const splash = await app.firstWindow()

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
  const splash = await app.firstWindow()

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

  await settings.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => app.windows().some((c) => c.url().includes('#settings'))).toBe(false)
  await expect(splash.getByRole('button', { name: 'Start' })).toBeVisible()

  await app.close()
})
