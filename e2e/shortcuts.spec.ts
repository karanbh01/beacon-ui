import { expect, openPage, test } from './fixtures'

/**
 * Settings → Keyboard shortcuts (BU-290). Only the app can show that keys
 * pressed to be recorded reach the recorder and nothing else: Ctrl+Shift+P
 * is taken before anything sees it, and Ctrl+T opens a tab.
 */
test('records a shortcut without acting on it, saves it and resets it', async ({ window }) => {
  await openPage(window, 'Beacon View')
  const tabs = await window.getByRole('tab').count()

  await window.getByRole('button', { name: 'Settings' }).click()
  await window.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click()
  const dialog = window.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'New shortcut for Presets' }).click()
  await window.keyboard.press('Control+Shift+P')
  await expect(window.getByRole('dialog', { name: 'Presets' })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'New shortcut for New tab' }).click()
  await window.keyboard.press('Control+T')
  await expect(window.getByRole('tab')).toHaveCount(tabs)
  await expect(dialog.getByText('Used by New tab')).toHaveCount(0)

  // Ctrl+T is New tab's own, so there is nothing to save; Ctrl+Shift+N is new.
  await expect(dialog.getByRole('button', { name: 'Save the shortcut for New tab' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'New shortcut for New tab' }).click()
  await window.keyboard.press('Control+Shift+N')
  await dialog.getByRole('button', { name: 'Save the shortcut for New tab' }).click()
  await expect(dialog.getByRole('img', { name: 'Ctrl+Shift+N' })).toHaveCount(1)

  await dialog.getByRole('button', { name: 'Reset the shortcut for New tab' }).click()
  await expect(dialog.getByRole('img', { name: 'Ctrl+Shift+N' })).toHaveCount(0)

  // Escape stops listening first, and only then closes the pop-up.
  await dialog.getByRole('button', { name: 'New shortcut for New tab' }).click()
  await window.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a shortcut saved in Settings is the one that works, and the menu says so (BU-291)', async ({
  app,
  window
}) => {
  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'Settings' }).click()
  await window.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click()
  const dialog = window.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await dialog.getByRole('button', { name: 'New shortcut for New tab' }).click()
  await window.keyboard.press('Control+Shift+N')
  await dialog.getByRole('button', { name: 'Save the shortcut for New tab' }).click()
  // Close tab gives Ctrl+W up for Ctrl+Shift+W.
  await dialog.getByRole('button', { name: 'New shortcut for Close tab' }).click()
  await window.keyboard.press('Control+Shift+W')
  await dialog.getByRole('button', { name: 'Save the shortcut for Close tab' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()

  // The old keys do nothing now, and the new ones open the + menu.
  await window.keyboard.press('Control+T')
  await expect(window.getByRole('menu')).toHaveCount(0)
  await window.keyboard.press('Control+Shift+N')
  await expect(window.getByRole('menu')).toBeVisible()
  await window.keyboard.press('Enter')
  await expect(window.locator('.tab-select')).toHaveCount(1)

  // Ctrl+W is nothing's now, and still never closes the window.
  await window.keyboard.press('Control+W')
  await expect(window.locator('.tab-select')).toHaveCount(1)
  expect(app.windows().some((page) => !page.isClosed())).toBe(true)
  await window.keyboard.press('Control+Shift+W')
  await expect(window.locator('.tab-select')).toHaveCount(0)

  await window.getByRole('button', { name: 'Edit' }).click()
  await expect(window.getByRole('menuitem', { name: /New tab/ })).toContainText('Ctrl+Shift+N')
})
