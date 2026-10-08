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
  await expect(window.getByText(/Choose an as-of date/)).toBeVisible()

  await window.getByRole('button', { name: 'Back to all universes' }).click()
  await expect(window.locator('.universe-overview')).toBeVisible()
  // Nothing to go back to from the list itself.
  await expect(window.getByRole('button', { name: 'Back to all universes' })).toHaveCount(0)
})

test('a universe without a date asks for one, with no orb and no table', async ({ window }) => {
  // Without a date there is nothing to wait for (BU-230), and since BU-231
  // nothing to list either: the members show only as they stood on a date.
  // Undated listings only: the list of universes counts its members at the
  // latest date, which is a different request and is meant to happen.
  let asked = 0
  window.on('request', (request) => {
    const url = request.url()
    if (url.includes('/data/reference?') && !url.includes('date=')) asked += 1
  })
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await choose(window, 'Universe', 'GLOBAL')

  await expect(
    window.getByText(/Choose an as-of date to see which members of All loaded assets/)
  ).toBeVisible()
  await expect(window.locator('[data-hairline="calendar"]')).toBeVisible()
  await expect(window.getByRole('status', { name: /Loading GLOBAL/ })).toHaveCount(0)
  await expect(window.locator('.universe-footnote')).toHaveCount(0)
  expect(asked).toBe(0)
})

test('a universe at a date waits behind the orb, then shows who was listed', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await choose(window, 'Universe', 'GLOBAL')
  await expect(window.getByText(/Choose an as-of date/)).toBeVisible()

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
