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
