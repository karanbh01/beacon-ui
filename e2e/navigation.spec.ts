import { expect, openPage, test } from './fixtures'

/**
 * Moving around from the keyboard, in the desktop app (BU-276 to BU-278):
 * Ctrl+Up/Down for sections, Ctrl+Left/Right for tabs, Ctrl+Shift+arrows for
 * the window that way, and none of it while typing.
 */

const section = (window: import('@playwright/test').Page, label: string) =>
  window.locator('nav[aria-label="Sections"]').getByRole('button', { name: label, exact: true })

test('Ctrl+Up and Ctrl+Down step through the sections', async ({ window }) => {
  await openPage(window, 'Strategy Builder')

  await window.keyboard.press('Control+ArrowUp')
  await expect(section(window, 'Optimiser')).toHaveAttribute('aria-current', 'page')

  await window.keyboard.press('Control+ArrowDown')
  await window.keyboard.press('Control+ArrowDown')
  await expect(section(window, 'Derivatives')).toHaveAttribute('aria-current', 'page')
})

test('Ctrl+Shift+Left moves to the window that way and pulses it; Ctrl+Right moves its tabs', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  const openIn = async (pane: number, view: string): Promise<void> => {
    await window
      .locator(`[data-pane="${String(pane)}"]`)
      .getByRole('button', { name: 'New tab' })
      .click()
    await window.getByRole('menuitem', { name: view, exact: true }).click()
  }
  await openIn(0, 'Prices')
  await openIn(0, 'Charting')
  await openIn(1, 'Reference Data')

  // From the right-hand window, left is the left one.
  await window.locator('[data-pane="1"] .pane-body').click({ position: { x: 20, y: 400 } })
  await window.keyboard.press('Control+Shift+ArrowLeft')
  await expect(window.locator('[data-pane="0"] .pane-pulse')).toHaveCount(1)

  const left = window.locator('[data-pane="0"]')
  const selectedTab = left.locator('.tab-select[aria-current="true"]')
  const before = await selectedTab.textContent()
  await window.keyboard.press('Control+ArrowRight')
  await expect(selectedTab).not.toHaveText(before ?? '')
})

test('in a field, Ctrl and Shift with the arrows stay the field’s', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  const search = window.getByRole('combobox', { name: 'Search' })
  await search.fill('TECH10')

  await window.keyboard.press('Control+ArrowUp')
  await window.keyboard.press('Control+ArrowLeft')
  await window.keyboard.press('Control+Shift+ArrowLeft')

  await expect(section(window, 'Strategy Builder')).toHaveAttribute('aria-current', 'page')
  await expect(search).toHaveValue('TECH10')
})

test('Ctrl+T opens a tab from the keyboard, Ctrl+W closes it, and the app stays open', async ({
  app,
  window
}) => {
  await openPage(window, 'Data Explorer')

  await window.keyboard.press('Control+T')
  await expect(window.getByRole('menu')).toBeVisible()
  await window.keyboard.press('Enter')
  await expect(window.locator('.tab-select')).toHaveCount(1)

  // Electron's default menu would close the window here.
  await window.keyboard.press('Control+W')
  await expect(window.locator('.tab-select')).toHaveCount(0)
  expect(app.windows().some((page) => !page.isClosed())).toBe(true)

  await window.keyboard.press('Control+Shift+T')
  await expect(window.locator('.tab-select')).toHaveCount(1)
})

test('Alt+Shift+Right carries the tab into the window beside it', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()
  await window.locator('[data-pane="0"] .pane-body').click({ position: { x: 20, y: 400 } })

  await window.keyboard.press('Alt+Shift+ArrowRight')

  await expect(window.locator('[data-pane="0"] .tab-select')).toHaveCount(0)
  await expect(window.locator('[data-pane="1"] .tab-select', { hasText: 'Prices' })).toHaveCount(1)
})
