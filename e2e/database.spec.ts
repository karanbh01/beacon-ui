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

test('filters from a menu on the column, and only once applied', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  const rows = window.locator('.tbl-row')
  const all = await rows.count()

  // The menu hangs off the label rather than sitting in a row of boxes
  // beneath it (BU-148).
  await window.getByRole('button', { name: /^CLOSE/ }).click()
  await window.getByRole('textbox', { name: 'Filter CLOSE' }).fill('<0')
  // Typed is not asked (BU-154): the table is untouched until Apply.
  await expect(rows).toHaveCount(all)

  await window.getByRole('button', { name: 'Apply' }).click()
  await expect(rows).toHaveCount(0)

  await window.getByRole('button', { name: /^CLOSE/ }).click()
  await window.getByRole('button', { name: 'Clear' }).click()
  await expect(rows).toHaveCount(all)
})

test('sorts a column, and sorting off returns the engine order', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  const first = async (): Promise<string> =>
    (await window.locator('.tbl-row').first().textContent()) ?? ''

  const engineOrder = await first()

  await window.getByRole('button', { name: /^IDENTIFIER/ }).click()
  await window.getByRole('button', { name: 'Sort ↓' }).click()
  await window.getByRole('button', { name: 'Apply' }).click()
  const descending = await first()
  expect(descending).not.toBe(engineOrder)

  // Pressing the active direction again is the third state: off.
  await window.getByRole('button', { name: /^IDENTIFIER/ }).click()
  await window.getByRole('button', { name: 'Sort ↓' }).click()
  await window.getByRole('button', { name: 'Apply' }).click()
  expect(await first()).toBe(engineOrder)
})

test('a date column offers a range rather than one expression', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  await window.getByRole('button', { name: /^DATE/ }).click()
  await expect(window.getByRole('textbox', { name: 'DATE from' })).toBeVisible()

  // A window before the data starts leaves nothing, which is the honest
  // answer rather than an unchanged table (BU-148).
  await window.getByRole('textbox', { name: 'DATE to' }).fill('2000-01-01')
  await window.getByRole('button', { name: 'Apply' }).click()
  await expect(window.locator('.tbl-row')).toHaveCount(0)
})

test('the identifier is a filter on the request, not a prerequisite', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()

  const before = await window.locator('.tbl-row').count()

  // Typed into the column's own menu, which for THIS column reaches the
  // engine rather than the page (BU-148).
  await window.getByRole('button', { name: /^IDENTIFIER/ }).click()
  const filter = window.getByRole('combobox', { name: 'Filter IDENTIFIER' })
  await filter.fill('cmp00')

  // The one column whose values the engine knows, so it suggests them the
  // way the query bar does (BU-154).
  await expect(window.getByRole('listbox', { name: 'Identifier suggestions' })).toBeVisible()

  await filter.fill('CMP002')
  await filter.press('Enter')
  await expect(window.getByRole('textbox', { name: 'Identifier', exact: true })).toHaveValue(
    'CMP002'
  )

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

  // RATE belongs to FX, not to market bars (BU-139), and the index column is
  // a row counter the endpoint resets before paging (BU-149).
  await window.getByLabel('Dataset').selectOption({ label: 'Market' })
  await expect(window.getByRole('columnheader', { name: 'RATE' })).toHaveCount(0)
  await expect(window.getByRole('columnheader', { name: 'Index' })).toHaveCount(0)
})

test('takes the pane, and scrolls itself rather than the pane', async ({ window }) => {
  // BU-153: the price table has followed its pane since BU-127; this one ran
  // past the bottom of a short pane and dragged the paging row off a narrow
  // one.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Database')
  await expect(window.locator('.tbl-row').first()).toBeVisible()
  await expect(window.getByRole('button', { name: 'Next' })).toBeInViewport()

  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  await window.keyboard.press('Escape')

  const body = window.locator('.tbl-body').first()
  await expect(body).toBeVisible()

  // Ten market columns in half a window: the card keeps five of them and the
  // body takes over the scrolling.
  expect(await body.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
  expect(await window.locator('.tbl-row').count()).toBeGreaterThanOrEqual(5)

  await body.evaluate((node) => {
    node.scrollLeft = 240
  })
  const head = window.locator('.tbl-head').first()
  expect(await head.evaluate((node) => node.style.transform)).toBe('translateX(-240px)')

  // And the controls stay where they were put.
  await expect(window.getByRole('button', { name: 'Next' })).toBeInViewport()
})
