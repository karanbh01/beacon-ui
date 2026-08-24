import { expect, openPage, openView, test } from './fixtures'

/**
 * Data Explorer → Database (BU-102): the stored rows, unshaped.
 */

test('shows the engine’s own column names, not the view’s', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await window.getByRole('textbox', { name: 'Identifier' }).fill('CMP001')

  // Prices renders these as "Open" and "Close"; here they are what came.
  await expect(window.getByRole('columnheader', { name: 'open' })).toBeVisible()
  await expect(window.getByRole('columnheader', { name: 'volume' })).toBeVisible()
})

test('switches dataset without reloading the identifier', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await window.getByRole('textbox', { name: 'Identifier' }).fill('CMP001')
  await window.locator('.tbl-row').first().waitFor()

  await window.getByRole('combobox', { name: 'Dataset' }).selectOption('features')
  await expect(window.getByRole('columnheader', { name: 'field' })).toBeVisible()
  await expect(window.getByText('x_sentiment')).toBeVisible()
})

test('writes null as the word, since a dash could be a real value', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await window.getByRole('textbox', { name: 'Identifier' }).fill('CMP001')
  await window.getByRole('combobox', { name: 'Dataset' }).selectOption('features')

  await expect(window.locator('.database-null').first()).toBeVisible()
})
