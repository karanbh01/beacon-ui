import { expect, openPage, openView, test } from './fixtures'

/**
 * Data Explorer → Features (BU-99), against the endpoints BN-140 added.
 */

test('shows every feature the engine holds, grouped by dataset', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Features')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')

  await expect(window.getByRole('heading', { name: 'Fundamentals' })).toBeVisible()
  await expect(window.getByText('Eps')).toBeVisible()
  // Provenance is most of what makes a fundamental readable.
  await expect(window.getByText('period ending 2026-06-30, reported 2026Q2')).toBeVisible()
  await expect(window.getByText(/as of 2026-08-03/)).toBeVisible()
})

test('says the engine holds nothing rather than hiding the dataset', async ({ window }) => {
  // CMP001 has no alternative data. An absent card would read as "this
  // dataset does not exist", which is a different and wrong statement.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Features')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')

  // By role: the card title and the sentence beneath it both say the word.
  await expect(window.getByRole('heading', { name: 'Alternative' })).toBeVisible()
  await expect(window.getByText(/holds no alternative data for CMP001/)).toBeVisible()
})

test('fills the alternative card for a name that has some', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Features')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP002')
  await window.keyboard.press('Enter')

  await expect(window.getByText('X sentiment')).toBeVisible()
  await expect(window.getByText(/holds no alternative data/)).toHaveCount(0)
})
