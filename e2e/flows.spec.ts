import { expect, openPage, openView, test } from './fixtures'

/**
 * One flow per page, against the stub engine.
 *
 * These are not screenshot tests. Each one drives the app the way a user
 * would — open the page, open a view, type a ticker — and asserts on what the
 * pane says. The point is that the whole stack runs: real IPC, the real typed
 * client, real HTTP, the real query layer, the real views.
 */

test('launches on Home, with no tab anybody asked for', async ({ window }) => {
  // BU-59: the seeds are gone, so a fresh profile opens on Home and every
  // page starts empty.
  await expect(window.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  expect(await window.locator('.tab').count()).toBe(0)
})

test('the engine reports connected in the footer', async ({ window }) => {
  await expect(window.getByText(/engine connected · py-beacon 0.0.2/)).toBeVisible()
})

test('Data Explorer → Prices renders bars for a typed ticker', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  // A query view opens with no subject and waits, which is the whole point of
  // dropping the seeds.
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')

  await expect(window.getByText('LAST CLOSE')).toBeVisible()
  await expect(window.locator('.tbl-row').first()).toBeVisible()
})

test('Data Explorer → Coverage reports what the engine publishes', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Data Coverage')

  // BU-61: the union, not a sum. 512 + 512 would read 1,024.
  await expect(window.getByText('ASSETS COVERED', { exact: true })).toBeVisible()
  const assets = window.locator('.stat', { hasText: 'ASSETS COVERED' }).locator('.stat-value')
  await expect(assets).toHaveText('512')

  // Source and Frequency are columns since BN-119.
  await expect(window.getByRole('table').or(window.locator('.tbl'))).toBeVisible()
  await expect(window.getByText('synthetic').first()).toBeVisible()
})

test('Data Explorer → Corporate Actions states kind rather than guessing it', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Corporate Actions')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')

  // BU-60: pay date and status are columns, and a structural action shows no
  // quantity because `value` is not one in either column's units.
  await expect(window.getByText('Pay Date')).toBeVisible()
  await expect(window.getByText('Status')).toBeVisible()
  await expect(window.getByText('23 May 2026')).toBeVisible()
})

test('Strategy Builder → Universe fills every row from one request', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  // BU-63: the table used to fetch a call per name and stop at 60. The stub
  // serves 120, so a row past that proves the batch is being used.
  await expect(window.getByText('CMP000 Corporation')).toBeVisible()
  await expect(window.getByText('CMP100 Corporation')).toBeVisible()
  // ADV 3M is a derived field, returned only when named in `fields`.
  await expect(window.getByText('ADV 3M')).toBeVisible()
})

test('the + menu offers only what the page can open, and only what can attach', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'New tab' }).click()

  // BU-56: a linked view has nothing to follow on an empty page.
  await expect(window.getByRole('menuitem', { name: /Charting/ })).toBeDisabled()
  await expect(window.getByRole('menuitem', { name: 'Prices', exact: true })).toBeEnabled()
})

test('a page reopens as it was left', async ({ window }) => {
  await openPage(window, 'Derivatives')
  await openView(window, 'Futures')
  await expect(window.locator('.tab-label', { hasText: 'Futures' })).toBeVisible()

  await openPage(window, 'Reports')
  await expect(window.locator('.tab-label', { hasText: 'Futures' })).toHaveCount(0)

  await openPage(window, 'Derivatives')
  await expect(window.locator('.tab-label', { hasText: 'Futures' })).toBeVisible()
})

test('the chrome popovers open and dismiss', async ({ window }) => {
  await window.getByRole('button', { name: 'Data sources' }).click()
  await expect(window.getByRole('dialog', { name: 'Data sources' })).toBeVisible()

  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog', { name: 'Data sources' })).toHaveCount(0)

  // Search opens on the first character, not on submit.
  await window.locator('.menu-bar-search input').fill('e')
  await expect(window.getByRole('listbox', { name: 'Search results' })).toBeVisible()
})

test('the query bar suggests identifiers as you type', async ({ window }) => {
  // BU-72: ranked by the engine's own search (BN-127), not by a client-side
  // index of whatever happened to be in a universe.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  const field = window.getByRole('combobox', { name: 'Subject' })
  await field.fill('cmp01')

  const list = window.getByRole('listbox', { name: 'Identifier suggestions' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('option').first()).toContainText('CMP010')
  // Named from reference data, not just the bare ticker.
  await expect(list.getByRole('option').first()).toContainText('Corporation')

  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('Enter')

  await expect(field).toHaveValue('CMP010')
  await expect(window.locator('.tbl-row').first()).toBeVisible()
  await expect(list).toHaveCount(0)
})

test('a ticker the engine does not have submits, and says so', async ({ window }) => {
  // The suggestions are the engine's now (BN-127), but typing past them still
  // has to work — and the pane has to be honest about what came back.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP999')
  await window.keyboard.press('Enter')

  await expect(window.locator('.tab-chip-label')).toContainText('CMP999')
  await expect(window.getByText('Not found.')).toBeVisible()
})

test('a suggestion the view cannot serve is marked, not hidden', async ({ window }) => {
  // BN-127's `datasets`. REFONLY is in the reference dataset and not the
  // market one, so Prices says so rather than offering it identically and
  // failing when it is picked.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  await window.getByRole('combobox', { name: 'Subject' }).fill('refonly')

  const row = window.getByRole('option', { name: /REFONLY/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('no market data')
})

test('the app-wide search offers identifiers, not just open tabs', async ({ window }) => {
  // BU-72. Before this the menu bar found a symbol only if a tab already had
  // it as a subject, which made "go to anything" mean "go to what is open".
  await window.locator('.menu-bar-search input').fill('cmp02')

  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByText('ASSETS')).toBeVisible()
  await expect(results.getByRole('option', { name: /CMP020/ })).toBeVisible()

  await results
    .getByRole('option', { name: /CMP020/ })
    .first()
    .click()

  // Opens it on Prices, in Data Explorer.
  await expect(window.locator('.tab-chip-label')).toContainText('CMP020')
  await expect(window.locator('.prices-view')).toBeVisible()
})

test('closing a chart tab does not take the renderer down', async ({ window }) => {
  // React runs effect cleanups in declaration order, so the effect that
  // disposes the lightweight-charts instance ran before the one detaching its
  // series, and `removeSeries` on a disposed chart throws all the way out.
  // Unmounting the chart at all was enough — closing the tab, or moving it to
  // another pane. Found while building BU-55; the app went blank.
  const crashes: string[] = []
  window.on('pageerror', (error) => crashes.push(error.message))

  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')
  await openView(window, 'Charting')
  await window.locator('.level-chart').waitFor()

  await window.getByRole('button', { name: 'Close Charting' }).click()

  await expect(window.locator('.app-shell')).toBeVisible()
  expect(crashes, crashes.join('\n')).toEqual([])
})

test('the footer toggle themes the app, and the choice sticks', async ({ window }) => {
  const root = window.locator('html')
  const toggle = window.getByRole('switch', { name: 'Dark mode' })

  // BU-39: `system` is the default and tracks the OS live. The toggle is the
  // manual override, so touching it writes an explicit preference.
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  await toggle.click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await window.evaluate(() => localStorage.getItem('beacon.theme'))).toBe('dark')

  await toggle.click()
  await expect(root).toHaveAttribute('data-theme', 'light')
})

test('nothing logs an error while any of that happens', async ({ window }) => {
  const errors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  window.on('pageerror', (error) => errors.push(error.message))

  await openPage(window, 'Data Explorer')
  await openView(window, 'Data Coverage')
  await openPage(window, 'Beacon View')
  await openPage(window, 'Reports')

  expect(errors, errors.join('\n')).toEqual([])
})
