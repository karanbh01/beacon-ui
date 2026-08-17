import { expect, openPage, openView, test } from './fixtures'

/**
 * Creating and editing universes (BU-78, against BN-132).
 *
 * The whole acceptance path: from an empty workspace, build a universe out of
 * synthetic names, select it in an index definition, and watch the preview
 * resolve against it.
 */

test('the seeded universe is read-only, and says why', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await expect(window.getByText(/seeded by the engine/)).toBeVisible()
  // No Edit control at all, rather than one the engine would refuse. Scoped
  // to the view: "Edit" is also a menu-bar menu.
  await expect(window.locator('.universe-view').getByRole('button', { name: 'Edit' })).toHaveCount(
    0
  )
})

test('a universe is created from pasted names and appears in the catalogue', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Tech Ten')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP000, CMP001\nCMP002')
  await window.getByRole('button', { name: 'Add pasted' }).click()

  // The running count is what says whether you built what you meant to.
  await expect(window.getByText('3 members')).toBeVisible()

  await window.getByRole('button', { name: 'Create universe' }).click()

  // Selected, and its members are the ones pasted.
  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('TECH-TEN')
  await expect(window.locator('.tbl-row')).toHaveCount(3)
})

test('the engine’s validation error renders inline, not as a raw failure', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Bad List')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('NOPE001')
  await window.getByRole('button', { name: 'Add pasted' }).click()
  await window.getByRole('button', { name: 'Create universe' }).click()

  await expect(window.getByText(/not in reference data: NOPE001/)).toBeVisible()
})

test('a created universe is selectable in an index definition', async ({ window }) => {
  // The acceptance path, end to end.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('My Sector')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP010 CMP011')
  await window.getByRole('button', { name: 'Add pasted' }).click()
  await window.getByRole('button', { name: 'Create universe' }).click()
  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('MY-SECTOR')

  await openView(window, 'Index Definition')
  const starting = window.getByRole('combobox', { name: 'Starting universe' })
  await expect(starting).toBeVisible()
  await starting.selectOption('MY-SECTOR')

  await expect(window.getByText('2 eligible assets')).toBeVisible()
})
