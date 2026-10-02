import { expect, test } from './fixtures'

/**
 * The home page's release list (BU-219, BU-221).
 *
 * Beacon's releases and py-beacon's, and py-beacon's from the engine that is
 * actually connected (GET /changelog) rather than from the copy bundled at
 * build time. The stub reports a release the bundled copy has never heard
 * of, so finding it proves which source the list read.
 */
test('lists the connected engine’s own releases, and marks it current', async ({ window }) => {
  const entry = window.locator('.home-changelog-entry', { hasText: 'v0.0.2' })

  await expect(entry).toContainText('py-beacon')
  await expect(entry).toContainText('The engine these tests run against.')
  // The stub's /health says 0.0.2, so this is the engine running.
  await expect(entry).toContainText('current')
})

test('opens a release to its notes', async ({ window }) => {
  const entry = window.locator('.home-changelog-entry', { hasText: 'v0.0.2' })
  await entry.locator('summary').click()

  await expect(entry).toContainText('Every route the app calls.')
})
