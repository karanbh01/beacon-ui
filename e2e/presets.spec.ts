import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { appWindow, expect, openPage, splashWindow, test } from './fixtures'
import { join } from 'node:path'

/**
 * Saving a page's arrangement and putting it back (BU-119).
 *
 * Driven through the menus rather than the stores, because the thing being
 * tested is that a preset survives the round trip a person actually takes:
 * arrange, name, wreck it, choose the name again.
 */

/**
 * Click something in the View menu, by the words on it.
 *
 * Scoped to the open menu and matched by text rather than by role: a layout
 * is a `menuitemradio` because it can be ticked, a preset is a plain
 * `menuitem`, and this helper reaches both. `exact` on the button because the
 * sidebar's Beacon View matches a bare "View" as well.
 */
async function view(window: Page, label: string): Promise<void> {
  await window.getByRole('button', { name: 'View', exact: true }).click()
  await window.getByRole('menu', { name: 'View' }).getByText(label, { exact: true }).click()
}

function subject(window: Page, pane: number) {
  return window.locator(`[data-pane="${String(pane)}"]`).getByRole('combobox', { name: 'Subject' })
}

/** Items in the open View menu with these exact words. */
function inView(window: Page, label: string) {
  return window.getByRole('menu', { name: 'View' }).getByText(label, { exact: true })
}

async function openIn(window: Page, pane: number, title: string): Promise<void> {
  await window
    .locator(`[data-pane="${String(pane)}"]`)
    .getByRole('button', { name: 'New tab' })
    .click()
  await window.getByRole('menuitem', { name: title, exact: true }).click()
}

async function savePreset(window: Page, name: string): Promise<void> {
  await view(window, 'Save layout as preset…')
  await window.getByRole('textbox', { name: 'Preset name' }).fill(name)
  await window.getByRole('button', { name: 'Save' }).click()
}

test('an arrangement comes back by name, tabs and layout together', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await view(window, 'Two columns')

  await openIn(window, 0, 'Prices')
  // Scoped: both panes end up with a Subject field, and the assertion below
  // is about the one the preset restored into pane 0.
  await subject(window, 0).fill('CMP002')
  await window.keyboard.press('Enter')
  await openIn(window, 1, 'Reference Data')

  await savePreset(window, 'Research')

  // Wreck it: a different layout, and nothing of the arrangement left.
  await view(window, 'Single pane')
  await expect(window.locator('.pane')).toHaveCount(1)

  await view(window, 'Research')

  await expect(window.locator('.pane')).toHaveCount(2)
  await expect(window.locator('[data-pane="0"] .prices-view')).toBeVisible()
  await expect(window.locator('[data-pane="1"] .reference-view')).toBeVisible()
  // The subject comes back with the tab; the rows are fetched fresh.
  await expect(subject(window, 0)).toHaveValue('CMP002')
})

test('a preset belongs to its page, and is offered on no other', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openIn(window, 0, 'Prices')
  await savePreset(window, 'Explorer work')

  await openPage(window, 'Reports')
  await window.getByRole('button', { name: 'View', exact: true }).click()
  await expect(inView(window, 'Explorer work')).toHaveCount(0)
  await window.keyboard.press('Escape')

  await openPage(window, 'Data Explorer')
  await window.getByRole('button', { name: 'View', exact: true }).click()
  await expect(inView(window, 'Explorer work')).toBeVisible()
  await window.keyboard.press('Escape')
})

test('a name saved twice is one preset, and forgetting removes it', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openIn(window, 0, 'Prices')

  await savePreset(window, 'Daily')
  await openIn(window, 0, 'Corporate Actions')
  // Same name, so this replaces rather than making a second "Daily".
  await view(window, 'Save layout as preset…')
  await window.getByRole('textbox', { name: 'Preset name' }).fill('Daily')
  await expect(window.getByRole('button', { name: 'Replace' })).toBeVisible()
  await window.getByRole('button', { name: 'Replace' }).click()

  await window.getByRole('button', { name: 'View', exact: true }).click()
  await expect(inView(window, 'Daily')).toHaveCount(1)
  await window.keyboard.press('Escape')

  await view(window, 'Save layout as preset…')
  await window.getByRole('button', { name: 'Forget Daily' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()

  await window.getByRole('button', { name: 'View', exact: true }).click()
  await expect(inView(window, 'Daily')).toHaveCount(0)
  await window.keyboard.press('Escape')
})

test('presets outlive the app that saved them', async ({ engine }, testInfo) => {
  /*
   * A relaunch on the same profile, which is what a preset is FOR: the
   * arrangement is worth naming precisely because it should be there
   * tomorrow. Launched by hand because the shared fixture owns one app and
   * this needs two.
   */
  const profile = testInfo.outputPath('profile')
  const launch = async (): Promise<{ app: ElectronApplication; window: Page }> => {
    const app = await electron.launch({
      args: [join(__dirname, '..'), `--user-data-dir=${profile}`],
      env: {
        ...process.env,
        BEACON_SERVER_URL: engine.url,
        BEACON_NO_SYNTHETIC: '1',
        BEACON_NO_UPDATE: '1'
      }
    })
    const splash = await splashWindow(app)
    await splash.getByRole('button', { name: 'Start' }).click({ timeout: 30_000 })
    const window = await appWindow(app)
    await window.waitForSelector('.app-shell')
    return { app, window }
  }

  const first = await launch()
  await openPage(first.window, 'Data Explorer')
  await openIn(first.window, 0, 'Prices')
  await savePreset(first.window, 'Overnight')
  // Closed, not abandoned: two apps on one profile is not the thing being
  // tested, and the second must read what the first left behind on disk.
  await first.app.close()

  const second = await launch()
  await openPage(second.window, 'Data Explorer')
  await second.window.getByRole('button', { name: 'View', exact: true }).click()
  await expect(inView(second.window, 'Overnight')).toBeVisible()
  await second.app.close()
})
