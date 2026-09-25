import { expect, test } from './fixtures'

/**
 * Where data comes from (BU-215).
 *
 * Karan's design: the engine starts with or without data, and when there is
 * none the app says so in the footer — red — and offers the ways to get some
 * from the Data menu, rather than generating data before the engine starts
 * or opening a screen of its own.
 *
 * The stub models a py-beacon 0.1.2 engine: the data state rides /health,
 * which main polls every four seconds to supervise the engine, so the footer
 * follows within one poll rather than instantly.
 */
const POLL = { timeout: 10_000 }

test('an engine with nothing loaded turns the footer red', async ({ engine, window }) => {
  engine.unloadData()

  const missing = window.locator('.footer-status', { hasText: 'no data loaded' })
  await expect(missing).toBeVisible(POLL)
  await expect(missing.locator('.footer-dot')).toHaveClass(/dot-danger/)
  // It says where to go, since the footer is not where the remedy is.
  await expect(missing).toContainText('Data menu')
})

test('generating from the Data menu loads data and clears the red', async ({ engine, window }) => {
  engine.unloadData()
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toBeVisible(POLL)

  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await window.getByRole('menuitem', { name: 'Generate synthetic data' }).click()

  // The engine serves the new store; the next /health poll says so.
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toHaveCount(0, POLL)
  await expect(window.locator('.footer-status', { hasText: 'data updated' })).toBeVisible()
})

test('an engine that has data says nothing about it being missing', async ({ window }) => {
  // The ordinary case, and every existing test's: loaded, so freshness.
  await expect(window.locator('.footer-status', { hasText: 'data updated' })).toBeVisible(POLL)
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toHaveCount(0)
})

/** Answer the OS confirm with the default button, and keep what it asked. */
async function acceptConfirms(app: import('@playwright/test').ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { message?: string; detail?: string }
      ;(globalThis as { asked?: string[] }).asked ??= []
      ;(globalThis as { asked?: string[] }).asked?.push(
        `${options.message ?? ''} ${options.detail ?? ''}`
      )
      return Promise.resolve({ response: 0, checkboxChecked: false })
    }
  })
}

async function openSources(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await window.getByRole('menuitem', { name: 'Manage sources…' }).click()
  const dialog = window.getByRole('dialog', { name: 'Data sources' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('manage sources lists the engine’s stores, and which one is served', async ({ window }) => {
  /*
   * Karan's call: `Manage sources…` becomes the engine's registry rather than
   * a window that stored one path and restarted the engine to change it.
   */
  const dialog = await openSources(window)

  const served = dialog.locator('.sources-row', { hasText: 'Synthetic data' })
  await expect(served).toContainText('Generated')
  await expect(served).toContainText('serving')

  const folder = dialog.locator('.sources-row', { hasText: 'My prices' })
  await expect(folder).toContainText('Your folder')
  await expect(folder).not.toContainText('serving')

  // The engine refuses to remove the store it serves; the button says so first.
  await expect(served.getByRole('button', { name: 'Remove' })).toBeDisabled()
  await expect(served.getByRole('button', { name: 'Use' })).toBeDisabled()
})

test('using another store serves it, without a restart', async ({ window }) => {
  const dialog = await openSources(window)
  const folder = dialog.locator('.sources-row', { hasText: 'My prices' })

  await folder.getByRole('button', { name: 'Use' }).click()

  await expect(folder).toContainText('serving')
  await expect(dialog.locator('.sources-row', { hasText: 'Synthetic data' })).not.toContainText(
    'serving'
  )
})

test('a store can be renamed in place', async ({ window }) => {
  const dialog = await openSources(window)
  const folder = dialog.locator('.sources-row', { hasText: 'My prices' })

  await folder.getByRole('button', { name: 'Rename' }).click()
  await dialog.getByRole('textbox', { name: 'Store name' }).fill('Research prices')
  await window.keyboard.press('Enter')

  await expect(dialog.locator('.sources-row', { hasText: 'Research prices' })).toBeVisible()
  // Enter saved the name; the dialog is still open, since Escape was not it.
  await expect(dialog).toBeVisible()
})

test('removing a folder of yours only forgets it, and says so first', async ({ app, window }) => {
  /*
   * The distinction the dialog exists to get right. A store the engine made
   * goes with its files; a folder of the user's is only forgotten. The OS
   * confirm has to say which, or the two read alike.
   */
  await acceptConfirms(app)
  const dialog = await openSources(window)

  await dialog
    .locator('.sources-row', { hasText: 'My prices' })
    .getByRole('button', { name: 'Remove' })
    .click()

  await expect(dialog.locator('.sources-row', { hasText: 'My prices' })).toHaveCount(0)
  const asked = await app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? [])
  expect(asked.join(' ')).toContain('Forget')
  expect(asked.join(' ')).toContain('is not touched')
  expect(asked.join(' ')).not.toContain('cannot be undone')
})

test('the sources panel’s Manage link opens the same dialog', async ({ window }) => {
  // It used to open a separate window AND Data Coverage — the second a
  // leftover BU-145 meant to remove, contradicting the comment above it.
  await window.getByRole('button', { name: 'Data sources' }).click()
  await window.getByRole('button', { name: /Manage/ }).click()
  await expect(window.getByRole('dialog', { name: 'Data sources' })).toBeVisible()
})

/*
 * Open a data folder and Import files (BU-215).
 *
 * Both start at an OS picker, which a test cannot click through. Main's
 * `dialog.showOpenDialog` is replaced with one that answers as a reader
 * would have, so everything after the picker — the engine call, its
 * refusal, the list — is the real path.
 */
async function pickerAnswers(
  app: import('@playwright/test').ElectronApplication,
  paths: string[]
): Promise<void> {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: filePaths.length === 0, filePaths })
  }, paths)
}

async function fromDataMenu(window: import('@playwright/test').Page, item: RegExp) {
  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await window.getByRole('menuitem', { name: item }).click()
  const dialog = window.getByRole('dialog', { name: 'Data sources' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('opening a data folder registers it, names it, and serves it', async ({ app, window }) => {
  // A Windows path, as the picker returns one: the name is its last segment.
  await pickerAnswers(app, ['D:\\research\\rates'])
  const dialog = await fromDataMenu(window, /Open a data folder/)

  const row = dialog.locator('.sources-row', { hasText: 'rates' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Your folder')
  await expect(row).toContainText('serving')
})

test('a folder that is not a store is refused with the engine’s reason', async ({
  app,
  window
}) => {
  await pickerAnswers(app, ['D:\\holiday photos'])
  const dialog = await fromDataMenu(window, /Open a data folder/)

  await expect(dialog).toContainText('is not a py-beacon data store')
  // Nothing was registered, so nothing new is listed.
  await expect(dialog.locator('.sources-row')).toHaveCount(2)
})

test('a folder already in the list is refused, not added twice', async ({ app, window }) => {
  await pickerAnswers(app, ['D:\\research\\prices'])
  const dialog = await fromDataMenu(window, /Open a data folder/)

  await expect(dialog).toContainText('already registered')
  await expect(dialog.locator('.sources-row')).toHaveCount(2)
})

test('importing files makes a new store and serves it', async ({ app, window }) => {
  await pickerAnswers(app, ['D:\\exports\\prices.xlsx'])
  const dialog = await fromDataMenu(window, /Import files/)

  const row = dialog.locator('.sources-row', { hasText: 'Imported data' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Imported')
  await expect(row).toContainText('serving')
})

test('an import with bad rows lists each one, and saves nothing', async ({ app, window }) => {
  // Every row is checked before anything is saved, so a refusal leaves the
  // list as it was — and names the rows to fix, not only a count.
  await pickerAnswers(app, ['D:\\exports\\bad.csv'])
  const dialog = await fromDataMenu(window, /Import files/)

  await expect(dialog).toContainText('The engine rejected this as written.')
  await expect(dialog).toContainText('market, row 4, DATE')
  await expect(dialog).toContainText('is not a date written as YYYY-MM-DD')
  await expect(dialog.locator('.sources-row')).toHaveCount(2)
})

test('a dismissed picker leaves everything as it was', async ({ app, window }) => {
  // Cancelling is an answer, not an error.
  await pickerAnswers(app, [])
  const dialog = await fromDataMenu(window, /Import files/)

  await expect(dialog.locator('.sources-row')).toHaveCount(2)
  await expect(dialog.locator('.view-state')).toHaveCount(0)
})

/*
 * Refreshing a store from its own source (BU-217, py-beacon BN-238/BN-240).
 *
 * The engine names the refresh each store supports. The stub's served store
 * is generated, so it extends; the folder beside it is not served, and a
 * folder is only ever re-read while it is.
 */
test('the served store refreshes from the sources dialog', async ({ window }) => {
  const dialog = await openSources(window)
  const serving = dialog.locator('.sources-row', { hasText: 'Synthetic data' })

  const asked = window.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/data/stores/synthetic/refresh')
  )
  await serving.getByRole('button', { name: 'Refresh' }).click()
  await asked

  // Accepted, so nothing to report — the job's own progress is the tray's.
  await expect(dialog.locator('.view-state')).toHaveCount(0)
})

test('a folder not being served offers no re-read, and says why', async ({ window }) => {
  const dialog = await openSources(window)
  const folder = dialog.locator('.sources-row', { hasText: 'My prices' })
  const refresh = folder.getByRole('button', { name: 'Refresh' })

  await expect(refresh).toBeDisabled()
  await expect(refresh).toHaveAttribute('title', /read afresh when it is used/)
})

test('imported files are refreshed by importing them again, not here', async ({ app, window }) => {
  await pickerAnswers(app, ['D:/exports/prices.xlsx'])
  const dialog = await fromDataMenu(window, /Import files/)

  const imported = dialog.locator('.sources-row', { hasText: 'Imported data' })
  await expect(imported.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(imported.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
    'title',
    /importing them again/
  )
})

test('the Data menu refreshes the store being served', async ({ window }) => {
  await window.getByRole('button', { name: 'Data', exact: true }).click()
  const item = window.getByRole('menuitem', { name: 'Refresh data' })
  await expect(item).toBeEnabled()

  const asked = window.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/data/stores/synthetic/refresh')
  )
  await item.click()
  await asked
})

test('with nothing served there is nothing to refresh', async ({ engine, window }) => {
  engine.unloadData()
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toBeVisible(POLL)

  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await expect(window.getByRole('menuitem', { name: 'Refresh data' })).toBeDisabled()
})
