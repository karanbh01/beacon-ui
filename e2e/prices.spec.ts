import { readFile } from 'node:fs/promises'
import { expect, openPage, openView, test } from './fixtures'

/**
 * The Prices header controls (BU-106).
 *
 * Both were drawn with a chevron and wired to nothing, which is exactly the
 * state a test cannot tell from working — so these assert the effects: the
 * engine echoing the interval it was asked for, and a file on disk that is
 * really a workbook.
 */
test('the interval control reaches the engine, and Export writes a workbook', async ({
  window,
  app
}, testInfo) => {
  // BU-106. Both were chevron buttons that did nothing.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  // The control names the FREQUENCY since BU-142 — `native` is what the
  // parameter is called, and the loaded data is daily.
  await expect(window.getByText(/· daily ·/)).toBeVisible()
  await window.getByRole('button', { name: 'Daily' }).click()
  await window.getByRole('menuitem', { name: 'Monthly' }).click()
  await expect(window.getByText(/· monthly ·/)).toBeVisible()

  // Answer the save dialog in the main process, so the write is real.
  const target = testInfo.outputPath('prices.xlsx')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
  }, target)

  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: 'Excel' }).click()

  // A real xlsx is a zip: "PK" are the first two bytes of the local header.
  await expect(async () => {
    const head = await readFile(target)
    expect(head.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(head.byteLength).toBeGreaterThan(2_000)
  }).toPass({ timeout: 10_000 })
})

test('serves a currency pair, because a pair is just another identifier', async ({ window }) => {
  // BU-101 / BN-144. There is no /data/fx: pairs come through the prices
  // endpoint, which is why this view needed nothing but a working engine.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('EURUSD')
  await window.keyboard.press('Enter')

  await expect(window.locator('.tbl-row').first()).toBeVisible()
  await expect(window.getByText(/rows ·/)).toBeVisible()
})

test('finds a pair in the identifier search, or it is unreachable', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('EURUS')

  await expect(window.getByRole('option', { name: /EURUSD/ })).toBeVisible()
})

test('adds an adjusted close on request, and not otherwise', async ({ window }) => {
  // BU-106 removed this control because no adjusted series existed. BN-146
  // added one, and `adjusted` ADDS a column rather than replacing CLOSE.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  await expect(window.getByRole('columnheader', { name: 'Adj Close' })).toHaveCount(0)

  await window.getByRole('button', { name: 'Unadjusted' }).click()
  await window.getByRole('menuitem', { name: 'Adjusted for actions' }).click()

  await expect(window.getByRole('columnheader', { name: 'Adj Close' })).toBeVisible()
})
