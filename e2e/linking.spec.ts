import { expect, openPage, openView, test } from './fixtures'

/**
 * Forming and breaking a link from the tab's chip (BU-104, moved by BU-108).
 *
 * The store has had `linkTab` and `severLink` since BU-16 with no way to
 * reach either: a tab could only be born linked, and the only way out was to
 * type — a gesture nothing on screen mentioned.
 *
 * The control lives on the chip, so a tab needs a subject before it can be
 * linked: the chip IS the binding, and a tab bound to nothing has none to
 * click. Look at something, then follow something.
 */

/** Both tabs carrying a subject, which is the state linking starts from. */
async function twoSubjects(window: import('@playwright/test').Page): Promise<void> {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP005')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  await openView(window, 'Reference Data')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('.reference-grid').waitFor()
}

test('links one tab to another, and the follower takes its subject', async ({ window }) => {
  await twoSubjects(window)

  await window.getByRole('button', { name: 'Link CMP001' }).click()
  await window.getByRole('menuitem', { name: /Prices/ }).click()

  // Following, so it shows the source's subject rather than its own.
  await expect(window.getByRole('combobox', { name: 'Subject' })).toHaveValue('CMP005')
  // BU-108: both ends wear the chain, so the strip shows two.
  await expect(window.locator('.tab-chip-chain')).toHaveCount(2)
})

test('unlinks from the same control, which is the part that never existed', async ({ window }) => {
  await twoSubjects(window)

  await window.getByRole('button', { name: 'Link CMP001' }).click()
  await window.getByRole('menuitem', { name: /Prices/ }).click()

  // Now following, so its chip reads the inherited subject.
  await window.getByRole('button', { name: 'Link CMP005' }).last().click()
  await window.getByRole('menuitem', { name: /^Unlink from/ }).click()

  await expect(window.locator('.tab-chip-chain')).toHaveCount(0)
  // Severing keeps the subject it was showing (taxonomy 2).
  await expect(window.getByRole('combobox', { name: 'Subject' })).toHaveValue('CMP005')
})

test('offers nothing to follow when no other tab has a subject', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP005')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  await window.getByRole('button', { name: 'Link CMP005' }).click()
  await expect(window.getByText('No other tab has a subject to follow.')).toBeVisible()
})
