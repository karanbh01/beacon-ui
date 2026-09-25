import { expect, test } from './fixtures'

/**
 * Where data comes from (BU-215).
 *
 * Karan's design: the engine starts with or without data, and when there is
 * none the app says so in the footer — red — and offers the ways to get some
 * from the Data menu, rather than generating data before the engine starts
 * or opening a screen of its own.
 *
 * The stub models a py-beacon 0.1.2 engine: the data state rides /health,
 * which main polls every four seconds to supervise the engine, so the footer
 * follows within one poll rather than instantly.
 */
const POLL = { timeout: 10_000 }

test('an engine with nothing loaded turns the footer red', async ({ engine, window }) => {
  engine.unloadData()

  const missing = window.locator('.footer-status', { hasText: 'no data loaded' })
  await expect(missing).toBeVisible(POLL)
  await expect(missing.locator('.footer-dot')).toHaveClass(/dot-danger/)
  // It says where to go, since the footer is not where the remedy is.
  await expect(missing).toContainText('Data menu')
})

test('generating from the Data menu loads data and clears the red', async ({ engine, window }) => {
  engine.unloadData()
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toBeVisible(POLL)

  await window.getByRole('button', { name: 'Data', exact: true }).click()
  await window.getByRole('menuitem', { name: 'Generate synthetic data' }).click()

  // The engine serves the new store; the next /health poll says so.
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toHaveCount(0, POLL)
  await expect(window.locator('.footer-status', { hasText: 'data updated' })).toBeVisible()
})

test('an engine that has data says nothing about it being missing', async ({ window }) => {
  // The ordinary case, and every existing test's: loaded, so freshness.
  await expect(window.locator('.footer-status', { hasText: 'data updated' })).toBeVisible(POLL)
  await expect(window.locator('.footer-status', { hasText: 'no data loaded' })).toHaveCount(0)
})
