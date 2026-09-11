import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * The Weights pane's three faces (BU-177).
 *
 * Weight Detail is the cross-section this pane always was. Portfolio and
 * Active are the two questions it could not answer — how the holdings
 * moved, and how they differ from a benchmark — and both read the stored
 * backtest record, which carries the decided compositions and the daily
 * panel they drift into (BN-186).
 */

async function openWeights(window: Page, indexId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await openView(window, 'Overview')
  await window
    .locator('.index-overview-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(indexId)
  await window.keyboard.press('Enter')

  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Weights', exact: true }).click()
}

test('weight detail opens first, and the bar lane is gone', async ({ window }) => {
  await openWeights(window, 'TECH10')

  await expect(window.getByRole('radio', { name: 'Weight Detail' })).toBeChecked()
  await expect(window.locator('.tbl-head')).toContainText('Index w')

  // A weight is already a number in the column beside it; the lane was
  // competing with the two columns that say something new (BU-177).
  await expect(window.locator('.tbl-bar')).toHaveCount(0)
})

test('a benchmark adds its weight and the difference from it', async ({ window }) => {
  await openWeights(window, 'TECH10')

  // Neither column before there is a benchmark: two empty ones would read
  // as a benchmark holding nothing rather than one nobody named.
  await expect(window.locator('.tbl-head')).not.toContainText('Active')

  await window.getByLabel('Benchmark').selectOption('EU-VALUE')

  await expect(window.locator('.tbl-head')).toContainText('EU-VALUE w')
  await expect(window.locator('.tbl-head')).toContainText('Active')
  // CMP000 is held here and not by EU-VALUE, so the whole position is
  // active — a number, not a blank.
  const first = window.locator('.tbl-body .tbl-row').first()
  await expect(first).toContainText('CMP000')
  await expect(first.locator('.num-pos')).toBeVisible()
})

test('portfolio puts names down and dates across', async ({ window }) => {
  await openWeights(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(window.locator('.tbl-head')).toContainText('Constituent')
  // Column headers are dates, which is the whole shape of this table.
  await expect(window.locator('.tbl-head')).toContainText(/\d{4}-\d{2}-\d{2}/)
  await expect(window.locator('.tbl-body .tbl-row').first()).toContainText('CMP000')

  // A holding is not a signed quantity: "+12.00%" would claim a direction
  // this number does not have.
  await expect(window.locator('.tbl-body').first()).not.toContainText('+1')
})

test('the frequency control changes what a cell means, not just its label', async ({ window }) => {
  await openWeights(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(window.locator('.index-weights-view')).toContainText(
    'the composition decided at each rebalance'
  )
  const decided = await window.locator('.tbl-head .tbl-cell').count()

  await window.getByRole('radio', { name: 'Monthly' }).click()

  // Held weights, drift included — a different question, and the footnote
  // says so rather than letting the frequency change it silently.
  await expect(window.locator('.index-weights-view')).toContainText(
    'what was held on each date, drift included'
  )
  expect(await window.locator('.tbl-head .tbl-cell').count()).toBeGreaterThan(decided)
})

test('aggregation rolls names into groups and keeps the total', async ({ window }) => {
  await openWeights(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  // The dimensions come from the reference data, not a declared list, so
  // whatever the engine carries is what can be grouped on.
  await window.getByLabel('Aggregate by').selectOption('country_domicile')

  await expect(window.locator('.tbl-head')).toContainText('Group')
  await expect(window.locator('.tbl-body .tbl-row').first()).toContainText(/US|IE|JP/)
  // An aggregation that changed the total would be a different index.
  // The label and the value are separate elements, so no space between.
  await expect(window.locator('.index-weights-view')).toContainText(/Σ latest\s*100\.00%/)
})

test('active subtracts the benchmark, and the actives sum to zero', async ({ window }) => {
  await openWeights(window, 'TECH10')
  await window.getByRole('radio', { name: 'Active' }).click()

  await expect(window.locator('.index-weights-view')).toContainText('Choose a benchmark')

  await window.getByLabel('Benchmark').selectOption('EU-VALUE')

  // Both sides fully invested, so the overweights pay for the underweights.
  await expect(window.locator('.index-weights-view')).toContainText(/Σ active\s*0\.00%/)
  await expect(window.locator('.num-neg').first()).toBeVisible()
  await expect(window.locator('.num-pos').first()).toBeVisible()
})

test('an index nobody has run has no history to show, and says which', async ({ window }) => {
  // Weights over time live in a backtest result, so an index still being
  // edited has none. Saying so beats an empty table.
  await openWeights(window, 'TECH10-OPT')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(window.locator('.index-weights-view')).toContainText('has no stored run')
  await expect(window.locator('.tbl-body')).toHaveCount(0)
})

test('a benchmark with no run of its own says so rather than showing dashes', async ({
  window
}) => {
  await openWeights(window, 'TECH10')
  await window.getByRole('radio', { name: 'Active' }).click()
  await window.getByLabel('Benchmark').selectOption('TECH10-OPT')

  await expect(window.locator('.index-weights-view')).toContainText(
    'TECH10-OPT has no stored run, so there are no benchmark weights'
  )
})
