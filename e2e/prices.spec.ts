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

  await expect(window.getByText(/interval: native/)).toBeVisible()
  await window.getByRole('button', { name: 'Native' }).click()
  await window.getByRole('menuitem', { name: 'Monthly' }).click()
  await expect(window.getByText(/interval: monthly/)).toBeVisible()

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

test('Adjusted is gone rather than inert', async ({ window }) => {
  // The market data has no adjusted close and /data/prices takes no
  // `adjusted` parameter, so the button had nothing behind it.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  await expect(window.getByRole('button', { name: 'Adjusted' })).toHaveCount(0)
})
