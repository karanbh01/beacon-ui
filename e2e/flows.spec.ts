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
  // The tab lands on the overview (BU-93), so open a universe to get a table.
  await window.getByRole('combobox', { name: 'Universe' }).selectOption('GLOBAL')

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

test('the menu bar opens real dropdowns, and View drives the theme', async ({ window }) => {
  // BU-76. The nine labels were buttons with no behaviour since BU-15.
  const file = window.getByRole('button', { name: 'File' })
  await file.click()
  await expect(window.getByRole('menu', { name: 'File' })).toBeVisible()
  await expect(file).toHaveAttribute('aria-expanded', 'true')

  // Hovering a sibling switches menus — standard menu-bar traversal.
  await window.getByRole('button', { name: 'Edit', exact: true }).hover()
  await expect(window.getByRole('menu', { name: 'Edit' })).toBeVisible()
  await expect(window.getByRole('menu', { name: 'File' })).toHaveCount(0)

  // The one live menu: theme, from the keyboard alone.
  await window.getByRole('button', { name: 'View', exact: true }).hover()
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('Enter')

  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(window.getByRole('menu')).toHaveCount(0)
})

test('a placeholder menu item is present and inert', async ({ window }) => {
  // Rendered rather than omitted: a File menu with nothing in it reads as
  // broken, one visibly not yet wired reads as unfinished.
  await window.getByRole('button', { name: 'File' }).click()

  const item = window.getByRole('menuitem', { name: /New index/ })
  await expect(item).toBeVisible()
  await expect(item).toBeDisabled()
})

test('the palette opens a view by name, from the keyboard alone', async ({ window }) => {
  // BU-79. "frontier" is a thing you want to open, not a thing you want to
  // locate on a page first.
  await window.locator('.menu-bar-search input').fill('frontier')

  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByText('VIEWS')).toBeVisible()

  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('Enter')

  await expect(window.locator('.tab-label', { hasText: 'Frontier' })).toBeVisible()
})

test('the palette parses an intent in either order', async ({ window }) => {
  await window.locator('.menu-bar-search input').fill('prices CMP000')

  const results = window.getByRole('listbox', { name: 'Search results' })
  // The intent is the most specific reading, so it leads.
  await expect(results.getByRole('option').first()).toContainText('Prices · CMP000')

  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('Enter')

  await expect(window.locator('.tab-chip-label')).toContainText('CMP000')
  await expect(window.locator('.prices-view')).toBeVisible()
})

test('the palette lists the engine’s indices', async ({ window }) => {
  await window.locator('.menu-bar-search input').fill('tech')

  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByText('INDICES')).toBeVisible()
  await expect(results.getByRole('option', { name: /TECH10/ })).toBeVisible()
})

test('an empty query offers what you were just doing', async ({ window }) => {
  // Not nothing, which is what it used to be.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  const field = window.locator('.menu-bar-search input')
  await field.click()

  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByText('RECENT')).toBeVisible()
  await expect(results.getByRole('option', { name: /Prices/ })).toBeVisible()
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

test('Data Coverage reports the FX dataset', async ({ window }) => {
  // BU-100 / BN-145. The view is data-driven, so the engine sending the row
  // is the whole feature — this asserts the client does not filter it out.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Data Coverage')

  await expect(window.getByRole('cell', { name: 'FX', exact: true })).toBeVisible()
})

test('Reference Data states listing and domicile country separately', async ({ window }) => {
  // BU-114. The row asked for a `country` column no py-beacon dataset has,
  // so it was a permanent dash; the engine carries country_listing and
  // country_domicile, kept apart on purpose.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Reference Data')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('.reference-grid').waitFor()

  const identifiers = window.locator('.reference-card').first()
  await expect(identifiers.getByText('Country of Listing')).toBeVisible()
  await expect(identifiers.getByText('Country of Domicile')).toBeVisible()
  // CMP001 is listed in GB and domiciled in IE, which is the case that makes
  // one collapsed column wrong.
  await expect(identifiers.getByText('GB', { exact: true })).toBeVisible()
  await expect(identifiers.getByText('IE', { exact: true })).toBeVisible()
})

test('the search field browses with the arrows and completes with Tab', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  const search = window.getByRole('combobox', { name: 'Search' })

  await search.fill('CMP0')
  await window
    .getByRole('option', { name: /CMP001/ })
    .first()
    .waitFor()

  // Assets first (BU-123), so the first ArrowDown lands on a symbol and Tab
  // completes the obvious thing.
  const rows = window.getByRole('option')
  await expect(rows.first()).toContainText('CMP000')

  await search.press('ArrowDown')
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')

  await search.press('ArrowDown')
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true')
  // The input points at the row it has highlighted, so assistive tech follows.
  await expect(search).toHaveAttribute('aria-activedescendant', /identifier:CMP001/)

  await search.press('ArrowUp')
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')

  await search.press('Tab')
  await expect(search).toHaveValue('CMP000 ')
})

test('the chart frames the plot and keeps volume to a tenth of it', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')

  // Charting is linked, so it needs a query tab to follow.
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Charting', exact: true }).click()
  await window.locator('.level-chart-frame').waitFor()

  const box = await window.evaluate(() => {
    const frame = document.querySelector('.level-chart-frame')?.getBoundingClientRect()
    const plot = document.querySelector('.level-chart-plot')?.getBoundingClientRect()
    if (frame === undefined || plot === undefined) return undefined
    return { insetLeft: frame.left - plot.left, insetBottom: plot.bottom - frame.bottom }
  })

  // Inset on both axis sides, so the labels sit outside the box (BU-130).
  expect(box?.insetLeft ?? 0).toBeGreaterThan(20)
  expect(box?.insetBottom ?? 0).toBeGreaterThan(10)

  // The legend and the volume caption sit INSIDE that box, left aligned to
  // it rather than to the canvas, which includes the axis (BU-133).
  const labels = await window.evaluate(() => {
    const frame = document.querySelector('.level-chart-frame')?.getBoundingClientRect()
    const legend = document.querySelector('.level-chart-legend')?.getBoundingClientRect()
    const caption = document.querySelector('.level-chart-sublabel')?.getBoundingClientRect()
    if (frame === undefined || legend === undefined || caption === undefined) return undefined
    return {
      legend: legend.left - frame.left,
      caption: caption.left - frame.left,
      captionInside: caption.bottom < frame.bottom && caption.top > frame.top
    }
  })

  expect(labels?.legend).toBeGreaterThan(0)
  expect(labels?.legend).toBe(labels?.caption)
  expect(labels?.captionInside).toBe(true)
})

test('the chart draws the adjusted line or the traded one, never both', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Charting', exact: true }).click()

  // The footnote names the line, since two that differ only by dividends are
  // indistinguishable at chart scale (BU-129).
  await expect(window.getByText(/· unadjusted/)).toBeVisible()
  await window.getByLabel('Prices', { exact: true }).selectOption('adjusted')
  await expect(window.getByText(/· adjusted/)).toBeVisible()
  await expect(window.getByText(/· unadjusted/)).toHaveCount(0)
})

test('a view query bar completes with Tab', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()

  const field = window.getByRole('combobox', { name: 'Subject' })
  await field.fill('CMP00')
  await window
    .getByRole('option', { name: /CMP001/ })
    .first()
    .waitFor()

  await field.press('ArrowDown')
  await field.press('Tab')

  // Completed into the field, not committed: the table is still empty until
  // Enter (BU-126).
  await expect(field).toHaveValue(/^CMP00\d$/)
  await expect(window.getByText(/Type an identifier/)).toBeVisible()

  await field.press('Enter')
  await expect(window.locator('.tbl-row').first()).toBeVisible()
})

test('reference data lists the universes an instrument is actually in', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Reference Data', exact: true }).click()
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')

  const card = window.locator('.reference-card', { hasText: 'Universe membership' })
  await expect(card).toBeVisible()

  // The engine's answer (BN-132), not six invented index names read from
  // reference fields py-beacon has never carried (BU-143).
  await expect(card).toContainText('All loaded assets')
  await expect(card).toContainText('seeded')
  await expect(card).not.toContainText('S&P 500')
  await expect(card).not.toContainText('MSCI World')
})

test('the Data menu offers what this app imports, and where it comes from', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'Data', exact: true }).click()

  const menu = window.getByRole('menu', { name: 'Data' })
  const items = await menu.getByRole('menuitem').allTextContents()

  // Everything at once, then the data, then the documents describing it,
  // then where it comes from (BU-146).
  expect(items[0]).toContain('Refresh all')
  expect(items.at(-1)).toContain('Manage sources')
  // One row per dataset the ENGINE reports, so a dataset py-beacon adds
  // appears without a change in the renderer.
  expect(items.some((label) => label.includes('Import market data'))).toBe(true)
  expect(items.some((label) => label.includes('Import index definition'))).toBe(true)

  // Import is not wired yet, and says so rather than hiding.
  await expect(menu.getByRole('menuitem', { name: /Import market data/ })).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: /Manage sources/ })).toBeEnabled()
})

test('Manage sources opens the data settings window', async ({ app, window }) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await window.getByRole('menuitem', { name: /Manage sources/ }).click()

  // The window the splash opens (BU-111), not a second copy of it and not
  // Data Coverage, which was the nearest true answer before it existed.
  await expect
    .poll(() => app.windows().some((candidate) => candidate.url().includes('#settings')), {
      timeout: 30_000
    })
    .toBe(true)

  const settings = app.windows().find((candidate) => candidate.url().includes('#settings'))
  if (settings === undefined) throw new Error('the settings window did not open')
  await expect(settings.getByRole('textbox', { name: 'Store location' })).toBeVisible()
})

test('Prices carries a mini chart that follows the range and opens Charting', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()

  // Nothing loaded: no empty box (BU-141).
  await expect(window.locator('.sparkline')).toHaveCount(0)

  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await expect(window.locator('.sparkline')).toBeVisible()

  const points = async (): Promise<number> =>
    window.evaluate(
      () =>
        (document.querySelector('.sparkline polyline')?.getAttribute('points') ?? '').split(' ')
          .length
    )

  const year = await points()
  // The range control is a radiogroup, not a row of buttons.
  await window.getByRole('radio', { name: '1M', exact: true }).click()
  await expect(window.getByRole('button', { name: /open in Charting/ })).toContainText('1M')
  // Drawn from the rows on screen, so a shorter range is a shorter line.
  expect(await points()).toBeLessThan(year)

  await window.getByRole('button', { name: /open in Charting/ }).click()
  await expect(window.locator('.charting-view')).toBeVisible()
  await expect(window.getByRole('combobox', { name: 'Subject' }).last()).toHaveValue('CMP001')
})
