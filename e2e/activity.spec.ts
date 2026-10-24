import { choose, expect, openPage, test } from './fixtures'

/**
 * Home's Recent Activity is the app's own log (BU-287, Karan): what it ran
 * and saved, kept as it happened, with each job's steps.
 */
test('a backtest run shows on Home, with its steps, and opens its holdings', async ({ window }) => {
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await window.getByRole('button', { name: 'New backtest…' }).click()
  await choose(window, 'Strategy', 'TECH10')
  await window.getByRole('button', { name: 'Run backtest' }).click()
  await expect(window.getByText('The backtest for TECH10 has finished.')).toBeVisible()

  await window.getByRole('button', { name: 'Home', exact: true }).click()
  const run = window.getByRole('button', { name: 'Backtest of TECH10', exact: true })
  await expect(run).toBeVisible()
  await expect(window.locator('.timeline-step').first()).toBeVisible()

  await run.click()
  await window.getByRole('menuitem', { name: 'Holdings' }).click()
  await expect(window.locator('.index-weights-view')).toBeVisible()
})
