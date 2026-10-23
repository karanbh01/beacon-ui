import { expect, openPage, test } from './fixtures'

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
