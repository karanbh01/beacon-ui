import { expect, openPage, openView, test, choose } from './fixtures'

/**
 * Back to the list, a search for the preview, and no orb before a date
 * (BU-230). The list pickers were the only way out of an opened universe or
 * definition, which Karan found missing; the preview could only be reached
 * through Index Definition; and Universe Set showed its loading orb with no
 * date chosen, where there is nothing to wait for.
 */
test('Universe Set goes back to its list from an opened universe', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await choose(window, 'Universe', 'GLOBAL')
  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()

  await window.getByRole('button', { name: 'Back to all universes' }).click()
  await expect(window.locator('.universe-overview')).toBeVisible()
  // Nothing to go back to from the list itself.
  await expect(window.getByRole('button', { name: 'Back to all universes' })).toHaveCount(0)
})

test('a universe without a date shows its members, not the orb', async ({ window }) => {
  let held: (() => void) | undefined
  await window.route(/\/data\/reference\?/, async (route) => {
    // Hold the listings: without a date there must be nothing to wait for.
    await new Promise<void>((resolve) => {
      held = resolve
      setTimeout(resolve, 1_500)
    })
    await route.continue()
  })
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await choose(window, 'Universe', 'GLOBAL')

  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()
  await expect(window.getByRole('status', { name: /Loading GLOBAL/ })).toHaveCount(0)
  held?.()
})

test('a universe at a date waits behind the orb, then shows who was listed', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await choose(window, 'Universe', 'GLOBAL')
  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()

  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await window.route(/\/data\/reference\?.*date=/, async (route) => {
    await gate
    await route.continue()
  })
  await window.getByLabel('As of').fill('2018-01-02')

  await expect(window.getByRole('status', { name: /Loading GLOBAL/ })).toBeVisible()
  release()
  await expect(window.getByText('90 assets', { exact: false })).toBeVisible()
  await expect(window.getByRole('status', { name: /Loading GLOBAL/ })).toHaveCount(0)
})

test('Index Definition goes back to its catalogue from an opened definition', async ({
  window
}) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  await expect(window.locator('.index-overview')).toHaveCount(0)

  await window.getByRole('button', { name: 'Back to all indices' }).click()
  await expect(window.locator('.index-overview').getByText('TECH10', { exact: true })).toBeVisible()
})

test('Constituent Preview finds its index by search, not via Index Definition', async ({
  window
}) => {
  await openPage(window, 'Strategy Builder')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Constituent Preview', exact: true }).click()

  // With nothing named, the catalogue to choose from, and nothing to create.
  await expect(window.locator('.index-overview').getByText('TECH10', { exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'New index…' })).toHaveCount(0)

  // Or the search in the header, which is the point.
  const search = window.getByRole('combobox', { name: 'Subject' })
  await search.fill('TECH10')
  await search.press('Enter')
  await expect(window.getByText(/Choose a rebalance date to resolve this index at/)).toBeVisible()
})
