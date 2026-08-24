import { expect, openPage, openView, test } from './fixtures'

/**
 * Forming and breaking a link from the subject box (BU-104).
 *
 * The store has had `linkTab` and `severLink` since BU-16 with no way to
 * reach either: a tab could only be born linked, and the only way out was to
 * type — a gesture nothing on screen mentioned.
 */

test('links one tab to another, and the follower takes its subject', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP005')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  await openView(window, 'Reference Data')
  await window.getByRole('button', { name: 'Link this tab' }).click()
  await window.getByRole('menuitem', { name: /Prices/ }).click()

  // Following, so it shows the source's subject rather than its own.
  await expect(window.getByRole('combobox', { name: 'Subject' })).toHaveValue('CMP005')
  await expect(window.getByRole('button', { name: /^Linked to/ })).toBeVisible()
})

test('unlinks from the same control, which is the part that never existed', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP005')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  await openView(window, 'Reference Data')
  await window.getByRole('button', { name: 'Link this tab' }).click()
  await window.getByRole('menuitem', { name: /Prices/ }).click()

  await window.getByRole('button', { name: /^Linked to/ }).click()
  await window.getByRole('menuitem', { name: /^Unlink from/ }).click()

  await expect(window.getByRole('button', { name: 'Link this tab' })).toBeVisible()
  // Severing keeps the subject it was showing (taxonomy 2).
  await expect(window.getByRole('combobox', { name: 'Subject' })).toHaveValue('CMP005')
})

test('offers nothing to follow when no other tab has a subject', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  await window.getByRole('button', { name: 'Link this tab' }).click()
  await expect(window.getByText('No other tab has a subject to follow.')).toBeVisible()
})
