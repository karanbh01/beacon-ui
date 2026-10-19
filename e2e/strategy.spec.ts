import type { Page } from '@playwright/test'
import { choose, chooseLabel, expect, openPage, openView, test } from './fixtures'

/**
 * Strategy Builder → Strategy (py-beacon 0.9.0).
 *
 * Where a strategy is written — the index it holds, the kind, how it is
 * carried out — and saved for Beacon View to backtest. A document view like
 * Index Definition: its catalogue when nothing is open, a draft otherwise.
 */

async function openStrategies(window: Page): Promise<void> {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Strategy')
}

test('opens on the catalogue of stored strategies', async ({ window }) => {
  await openStrategies(window)

  const view = window.locator('.strategy-view')
  await expect(view.getByRole('button', { name: 'New strategy…' })).toBeVisible()
  await expect(view.locator('.tbl-row')).toHaveCount(6)
  // One whose index is not stored says it cannot run, in the list rather
  // than on its first backtest.
  await expect(view).toContainText("Its index 'NO-UNIVERSE' is not stored.")
})

test('a new strategy is written, saved, and handed to Backtest', async ({ window }) => {
  await openStrategies(window)

  await window.getByRole('button', { name: 'New strategy…' }).click()
  await window.getByLabel('Strategy id').fill('tech10-capped')
  await window.getByRole('button', { name: 'Create' }).click()

  await expect(window.getByText('new · not saved yet')).toBeVisible()
  // What stops a save is said before the engine is asked.
  await expect(window.getByText('A strategy needs a name.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Save' })).toBeDisabled()

  await window.getByLabel('Strategy name').fill('TECH10 capped')
  await choose(window, 'Index', 'TECH10')

  // A cap from the engine's catalogue, with its parameters as it lists them.
  await window.getByRole('button', { name: /Add cap/ }).click()
  await chooseLabel(window, 'Cap', 'Weight')
  await window.getByLabel('Largest weight').fill('0.1')

  await window.getByRole('button', { name: 'Validate' }).click()
  await expect(window.getByText('The engine would accept this strategy as written.')).toBeVisible()

  // Only what is saved can be run: the engine backtests the stored strategy.
  await expect(window.getByRole('button', { name: 'Backtest…' })).toBeDisabled()
  await window.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByText('new · not saved yet')).toHaveCount(0)

  await window.getByRole('button', { name: 'Backtest…' }).click()
  await openPage(window, 'Beacon View')
  await expect(window.locator('.backtest-strategy')).toContainText('TECH10 capped')
  await expect(window.locator('.backtest-strategy')).toContainText('WeightCap')
})

test('tracking asks how the index is held', async ({ window }) => {
  await openStrategies(window)
  await window.locator('.strategy-view').getByText('TECH10', { exact: true }).first().click()

  await choose(window, 'Kind', 'index_tracking')
  await expect(window.getByText(/Tracking needs a replication/)).toBeVisible()

  await chooseLabel(window, 'Replication', 'Futures')
  await expect(window.getByText(/Tracking needs a replication/)).toHaveCount(0)
  await expect(window.getByText('unsaved changes')).toBeVisible()

  // Revert puts back what is stored.
  await window.getByRole('button', { name: 'Revert' }).click()
  await expect(window.getByText('unsaved changes')).toHaveCount(0)
})

test('an active strategy takes a signal, a construction and constraints', async ({ window }) => {
  await openStrategies(window)
  await window.locator('.strategy-view').getByText('TECH10', { exact: true }).first().click()

  await choose(window, 'Kind', 'active')
  await expect(window.getByRole('combobox', { name: 'Signal' })).toBeVisible()
  await expect(window.getByRole('combobox', { name: 'Construction' })).toBeVisible()
  await expect(window.getByRole('button', { name: /Add constraint/ })).toBeVisible()
  await expect(window.getByLabel('Covariance window')).toBeVisible()
})
