import { expect, openPage, openView, test } from './fixtures'

/**
 * The menus as the desktop app runs them (0.2.5): Edit through Electron's
 * own commands (BU-273), and View's shortcuts against Electron's default
 * menu, which binds Ctrl+Shift+R to Force Reload (BU-274, BU-275).
 */

test('Edit → Paste pastes the clipboard into the field that had focus', async ({ app, window }) => {
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText('TECH10')
  })
  await openPage(window, 'Data Explorer')
  const search = window.getByRole('combobox', { name: 'Search' })
  await search.click()

  await window.getByRole('button', { name: 'Edit' }).click()
  await window.getByRole('menuitem', { name: /Paste/ }).click()

  await expect(search).toHaveValue('TECH10')
})

test('Ctrl+Shift+R resets the window, and does not reload the app', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await expect(window.locator('.tab-select', { hasText: 'Prices' }).first()).toBeVisible()
  // Set on the page itself: a reload would take it away.
  await window.evaluate(() => {
    ;(window as unknown as { stillHere: boolean }).stillHere = true
  })

  await window.keyboard.press('Control+Shift+R')

  await expect(window.locator('.tab-select', { hasText: 'Prices' })).toHaveCount(0)
  expect(
    await window.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)
  ).toBe(true)
})

test('Ctrl+Shift+P lists the page’s presets, and applies the one chosen', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  // Saved as a preset, then the page put back to one pane.
  await window.getByRole('button', { name: 'View', exact: true }).click()
  await window.getByRole('menuitem', { name: /Save layout as preset/ }).click()
  await window.getByRole('textbox', { name: 'Preset name' }).fill('Side by side')
  await window.getByRole('button', { name: 'Save', exact: true }).click()
  await window.keyboard.press('Control+Shift+R')
  await expect(window.locator('[data-pane="1"]')).toHaveCount(0)

  await window.keyboard.press('Control+Shift+P')
  const picker = window.getByRole('dialog', { name: 'Presets' })
  await picker.getByRole('option', { name: /Side by side/ }).click()

  await expect(picker).toHaveCount(0)
  await expect(window.locator('[data-pane="1"]')).toBeVisible()
})

test('Edit → New tab opens the + menu ready for Enter, and Close tab closes it again', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')

  await window.getByRole('button', { name: 'Edit', exact: true }).click()
  await window.getByRole('menuitem', { name: /New tab/ }).click()
  await window.keyboard.press('Enter')
  await expect(window.locator('.tab-select')).toHaveCount(1)

  await window.getByRole('button', { name: 'Edit', exact: true }).click()
  await window.getByRole('menuitem', { name: /Close tab/ }).click()
  await expect(window.locator('.tab-select')).toHaveCount(0)
})
