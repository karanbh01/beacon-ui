import { choose, expect, openPage, test } from './fixtures'

/**
 * Finding things from the keyboard in the desktop app (BU-283 to BU-285):
 * Ctrl+F's find bar, Ctrl+K to the search bar, and Alt in it for seek mode,
 * which only the app can show reaching the field rather than the window.
 */

async function openBacktest(window: import('@playwright/test').Page): Promise<void> {
  await openPage(window, 'Beacon View')
  await window.getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await expect(window.getByRole('button', { name: 'New backtest…' })).toBeVisible()
}

test('Ctrl+F finds text in the open windows and counts it', async ({ window }) => {
  await openBacktest(window)

  await window.keyboard.press('Control+F')
  const field = window.getByRole('textbox', { name: 'Find in windows' })
  await expect(field).toBeFocused()
  await field.fill('backtest')
  await expect(window.locator('.find-bar-count')).toHaveText(/^1 of \d+$/)

  await window.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
})

test('Ctrl+K goes to the search bar; Alt there seeks and presses a button', async ({ window }) => {
  await openBacktest(window)

  await window.keyboard.press('Control+K')
  const search = window.getByRole('combobox', { name: 'Search' })
  await expect(search).toBeFocused()

  await window.keyboard.press('Alt')
  await expect(window.locator('.menu-bar-search-surface-seeking')).toHaveCount(1)
  await expect(search).toBeFocused()

  await window.keyboard.type('new back')
  await expect(window.getByRole('button', { name: 'New backtest…' })).toHaveAttribute(
    'data-seek',
    'current'
  )
  await window.keyboard.press('Enter')

  // The button pressed: the new backtest's form is open.
  await expect(window.getByRole('heading', { name: 'New backtest' })).toBeVisible()
  await expect(window.locator('[data-seek]')).toHaveCount(0)

  // Still in the search bar, so Alt seeks again; Escape leaves it.
  await expect(search).toBeFocused()
  await window.keyboard.press('Alt')
  await expect(window.locator('.menu-bar-search-surface-seeking')).toHaveCount(1)
  await window.keyboard.press('Escape')
  await window.keyboard.press('Escape')
  await expect(search).not.toBeFocused()
})

/** Ctrl+K then Alt: seeking in the current window. */
async function seek(window: import('@playwright/test').Page, held = false): Promise<void> {
  await window.keyboard.press('Control+K')
  await window.keyboard.press('Alt')
  if (held) await window.keyboard.press('Alt')
}

test('seek reaches a chart’s dropdowns by the value they show, and holds on a second Alt', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Charting', exact: true }).click()
  await window.locator('.level-chart-plot').waitFor()

  // Held: each press leaves seek on, so the interval opens and is chosen in a run.
  await seek(window, true)
  await expect(window.locator('.menu-bar-search-surface-held')).toHaveCount(1)
  await window.keyboard.type('daily')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('listbox', { name: 'Interval' })).toBeVisible()
  await window.keyboard.type('weekly')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('combobox', { name: 'Interval' })).toHaveText('Weekly')

  await window.keyboard.type('unadj')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('listbox', { name: 'Prices' })).toBeVisible()
  await expect(window.locator('.menu-bar-search-surface-held')).toHaveCount(1)

  await window.keyboard.press('Escape')
  await expect(window.locator('.menu-bar-search-surface-seeking')).toHaveCount(0)
})

test('seek reaches Home’s activity, and what its pop-up leads to', async ({ window }) => {
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await window.getByRole('button', { name: 'New backtest…' }).click()
  await choose(window, 'Strategy', 'TECH10')
  await window.getByRole('button', { name: 'Run backtest' }).click()
  await expect(window.getByText('The backtest for TECH10 has finished.')).toBeVisible()
  await window.getByRole('button', { name: 'Home', exact: true }).click()

  await seek(window)
  await window.keyboard.type('backtest of')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('menuitem', { name: 'Holdings' })).toBeVisible()

  await window.keyboard.press('Alt')
  await window.keyboard.type('holdings')
  await window.keyboard.press('Enter')
  await expect(window.locator('.index-weights-view')).toBeVisible()
})

test('seek marks a form dropdown’s whole box, not only its words', async ({ window }) => {
  await openBacktest(window)
  await window.getByRole('button', { name: 'New backtest…' }).click()

  await seek(window)
  await window.keyboard.type('strat')
  const box = window.locator('.field-box:has([data-seek="current"])')
  await expect(box).toHaveCount(1)
  await expect(box).toHaveCSS('outline-style', 'solid')
  await expect(window.locator('.field-box [data-seek="current"]')).toHaveCSS(
    'outline-style',
    'none'
  )
})

test('Edit’s Persistent seek lands in the search bar, held', async ({ window }) => {
  await openBacktest(window)

  await window.getByRole('button', { name: 'Edit' }).click()
  await window.getByRole('menuitem', { name: /^Persistent seek/ }).click()
  const search = window.getByRole('combobox', { name: 'Search' })
  await expect(search).toBeFocused()
  await expect(window.locator('.menu-bar-search-surface-held')).toHaveCount(1)

  await window.keyboard.type('new back')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('heading', { name: 'New backtest' })).toBeVisible()
  await expect(window.locator('.menu-bar-search-surface-held')).toHaveCount(1)
  await window.keyboard.press('Escape')
  await expect(window.locator('.menu-bar-search-surface-seeking')).toHaveCount(0)
})
