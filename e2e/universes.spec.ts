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

test('a universe is built by filtering the dataset, and previewed before it is saved', async ({
  window
}) => {
  // BU-85. The controls are generated from the reference columns the engine
  // actually returned, so this also proves the batch was not rejected — an
  // unknown column name is a hard 422 and would leave no filters at all.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Health Names')

  // A row at a time, as the index designer is built (BU-90).
  await window.getByRole('button', { name: /Add filter/ }).click()
  await window.getByLabel('Row 01 dimension').selectOption('gics_sector')
  await window.getByRole('button', { name: 'Row 01 values' }).click()
  await window.getByRole('checkbox', { name: 'Health Care' }).check()
  await window.keyboard.press('Escape')

  const editor = window.locator('.universe-editor')
  // The count the row itself reports, which is what says whether the filter
  // did what you meant before you save it.
  await expect(editor.getByText('40 pass')).toBeVisible()
  await expect(editor.getByText('40 members', { exact: false })).toBeVisible()
  await expect(editor.locator('.tbl-row').first()).toBeVisible()

  await window.getByRole('button', { name: 'Create universe' }).click()

  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('HEALTH-NAMES')
  await expect(window.getByText('40 assets', { exact: false })).toBeVisible()
})

test('a symbol the dataset does not carry is called out as it is added', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP005, NOPE001')
  await window.getByRole('button', { name: 'Add pasted' }).click()

  // Said here rather than after a failed save — the engine refuses the whole
  // list for one bad name.
  await expect(window.getByText(/not in the dataset: NOPE001/)).toBeVisible()
  await expect(window.getByText(/1 added by hand, found in the dataset/)).toBeVisible()
})

test('a universe can be read as it stood on a past date', async ({ window }) => {
  // BU-92. The date goes to the engine, which returns only rows valid then;
  // a name not listed yet must drop out rather than draw as a blank row.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()

  await window.getByLabel('As of').fill('2018-01-02')

  // Every fourth synthetic name lists in 2020, so a quarter of them are gone.
  await expect(window.getByText('90 assets', { exact: false })).toBeVisible()
  await expect(window.getByText(/as of 2018-01-02/)).toBeVisible()
  await expect(window.getByText(/30 of the stored 120 were not listed then/)).toBeVisible()
})
