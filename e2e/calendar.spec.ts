import { expect, openPage, openView, test, openSelect } from './fixtures'

/**
 * A trading calendar is a required input (BN-180, BU-190).
 *
 * A calendar-less index treated every Monday-to-Friday as a session, so it
 * scheduled rebalances on 25 December. py-beacon made the field required
 * with no default anywhere — a default of XNYS would put New York's
 * calendar on a EUR index for anyone who did not look, which is the same
 * silent substitution in better manners.
 */
test('the calendar list comes from the engine, grouped by region', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()

  const calendar = await openSelect(window, 'Calendar')

  /*
   * Wait for the catalogue before reading it. `allTextContents` takes
   * whatever is in the DOM at that instant and does not retry, so asserting
   * on it directly races the request — which passes in isolation off a warm
   * cache and fails in a full run.
   */
  await expect(calendar.locator('.popover-heading')).toHaveCount(5)

  // Grouped from the region each row carries, not from a mapping here.
  expect(await calendar.locator('.popover-heading').allTextContents()).toEqual([
    'America',
    'Asia',
    'Australia',
    'Europe',
    'UTC'
  ])

  // A curated name, and an uncurated one falling back to its MIC rather
  // than vanishing from the only control that offers valid values.
  await expect(calendar.locator('[data-value="XNYS"]')).toContainText('New York Stock Exchange')
  await expect(calendar.locator('[data-value="AIXK"]')).toContainText('AIXK')
})

test('a new index cannot be saved without one', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.getByRole('button', { name: 'New index…' }).click()
  await window.getByRole('textbox', { name: 'Index id' }).fill('EU-TEST')
  await window.getByRole('button', { name: 'Create' }).click()

  await expect(window.getByRole('textbox', { name: 'Name' })).toBeVisible()
  // The control is marked required, and the list is the engine's.
  await expect(window.getByText('Calendar *')).toBeVisible()
})

test('a stored index shows the calendar it was migrated to', async ({ window }) => {
  // Documents written before the field existed were migrated to XNYS by
  // schema version 2, so they keep working and keep their ids.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()

  // The trigger shows the label, not the code — `toHaveValue` spoke to a
  // native element and there is not one now (BU-196).
  await expect(window.getByRole('combobox', { name: 'Calendar' })).toContainText(
    'New York Stock Exchange'
  )
})
