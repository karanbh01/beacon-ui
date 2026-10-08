import { expect, openPage, openView, test } from './fixtures'

/**
 * Empty states draw what is missing (BU-231): a Hairline figure above the
 * message, one figure per kind of nothing, in the app's own tokens.
 */
test('a view waiting for a ticker shows the ticker tape', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  await expect(window.getByText('Type an identifier to load its price history.')).toBeVisible()
  await expect(window.locator('[data-hairline="ticker"] svg')).toBeVisible()
})

test('the highlight is the accent, and there is no caption', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await window.locator('.universe-overview').getByText('All loaded assets').click()

  const figure = window.locator('.view-empty .empty-figure')
  await expect(figure.locator('[data-hairline="calendar"] svg')).toBeVisible()
  // Karan chose the accent over ink; the stroke resolves through the token,
  // so it follows the theme rather than being fixed here.
  const [stroke, accent] = await figure.evaluate((element) => {
    const bright = element.querySelector('.hi')
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    element.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return [bright === null ? '' : getComputedStyle(bright).stroke, resolved]
  })
  expect(stroke).toBe(accent)
  // Only the message speaks; the figure's own caption is left out.
  await expect(figure).toHaveText('')
})

test('the constituent preview keeps its calendar once a date is chosen', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Constituent Preview', exact: true }).click()
  const search = window.getByRole('combobox', { name: 'Subject' })
  await search.fill('TECH10')
  await search.press('Enter')

  await expect(window.getByText(/Choose a rebalance date/)).toBeVisible()
  await expect(window.locator('[data-hairline="calendar"]')).toBeVisible()
})
