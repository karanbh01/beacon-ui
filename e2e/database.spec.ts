import { expect, openPage, openView, test } from './fixtures'

/**
 * Data Explorer → Database (BU-138).
 *
 * The stored table, filterable from its own columns. It used to need an
 * identifier before it would show anything at all.
 */
test('opens with the whole dataset, no identifier typed', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')

  await expect(window.locator('.tbl-row').first()).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Identifier', exact: true })).toHaveValue('')
  // What is on screen against what exists, never one implying the other.
  await expect(window.getByText(/showing 1–\d+ of \d+/)).toBeVisible()
})

test('filters from the columns, and the filters combine', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  const rows = window.locator('.tbl-row')
  const all = await rows.count()

  await window.getByRole('textbox', { name: 'Filter IDENTIFIER' }).fill('CMP001')
  await expect(rows).toHaveCount(2)

  // A second filter narrows further rather than replacing the first.
  await window.getByRole('textbox', { name: 'Filter CLOSE' }).fill('>0')
  await expect(rows).toHaveCount(2)
  await window.getByRole('textbox', { name: 'Filter CLOSE' }).fill('<0')
  await expect(rows).toHaveCount(0)

  // Clearing them puts the page back.
  await window.getByRole('textbox', { name: 'Filter CLOSE' }).fill('')
  await window.getByRole('textbox', { name: 'Filter IDENTIFIER' }).fill('')
  await expect(rows).toHaveCount(all)
})

test('the identifier is a filter on the request, not a prerequisite', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  const before = await window.locator('.tbl-row').count()
  await window.getByRole('textbox', { name: 'Identifier', exact: true }).fill('CMP002')

  // Narrowed at the engine: the total falls, which a client-side filter
  // could not do.
  await expect(window.getByText(/showing 1–2 of 2/)).toBeVisible()
  expect(await window.locator('.tbl-row').count()).toBeLessThan(before)
})

test('reads every dataset the engine serves', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')

  for (const dataset of ['Reference', 'Corporate actions', 'Features']) {
    await window.getByLabel('Dataset').selectOption({ label: dataset })
    await expect(window.locator('.tbl-row').first()).toBeVisible()
  }

  // RATE belongs to FX, not to market bars (BU-139).
  await window.getByLabel('Dataset').selectOption({ label: 'Market' })
  await expect(window.getByRole('columnheader', { name: 'RATE' })).toHaveCount(0)
})
