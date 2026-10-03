import type { Page } from '@playwright/test'
import { expect, test, openPage, openView, choose } from './fixtures'

/** A tab in the strip, by its label: the views carry buttons of the same name. */
function tab(window: Page, label: string) {
  return window.locator('.tab-select', { hasText: label }).first()
}

/**
 * A tab keeps what it was showing (BU-227).
 *
 * A pane draws only its active tab, so switching away unmounted the view and
 * took its state with it: a preview run a moment ago came back asking to be
 * run, and Index Definition came back on its catalogue.
 */
test('a preview just run is still there after looking at another tab', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  await window.getByRole('button', { name: /Constituent Preview/ }).click()
  await choose(window, 'As of', '2026-06-19')
  await window.getByRole('button', { name: 'Run preview' }).click()
  await expect(window.locator('.tbl-body .tbl-row').first()).toBeVisible()

  let previewed = 0
  window.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/preview')) previewed += 1
  })

  await tab(window, 'Index Definition').click()
  await tab(window, 'Constituent Preview').click()

  // The same date, the same result, and nothing run again to get it back.
  await expect(window.getByRole('combobox', { name: 'As of' })).toContainText('2026-06-19')
  await expect(window.locator('.tbl-body .tbl-row').first()).toBeVisible()
  expect(previewed).toBe(0)
})

test('a fresh preview still asks to be run', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  await window.getByRole('button', { name: /Constituent Preview/ }).click()

  await expect(window.getByText(/Choose a rebalance date to resolve this index at/)).toBeVisible()
  await expect(window.locator('.tbl-body')).toHaveCount(0)
})

test('Index Definition comes back on the definition that was open', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  await expect(window.locator('.index-overview')).toHaveCount(0)

  await window.getByRole('button', { name: /Constituent Preview/ }).click()
  await tab(window, 'Index Definition').click()

  // Still in TECH10, not back on the catalogue.
  await expect(window.locator('.index-overview')).toHaveCount(0)
  await expect(window.getByText('Beacon US Technology Top 10').first()).toBeVisible()
})
