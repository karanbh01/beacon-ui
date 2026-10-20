import type { Page } from '@playwright/test'
import { expect, openPage, openSelect, openView, test, choose } from './fixtures'

/**
 * The Holdings pane's three faces (BU-177, BU-239, BU-244, BU-246).
 *
 * Holdings Detail is one day of the strategy's workflow, from its universe
 * to the fund's shares, run on request. Portfolio and Active read the stored
 * backtest record: how the fund's holdings moved, and how they differ from a
 * benchmark's.
 */

async function openHoldings(window: Page, strategyId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await openView(window, 'Overview')
  await window
    .locator('.index-overview-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(strategyId)
  await window.keyboard.press('Enter')

  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Holdings', exact: true }).click()
}

const view = (window: Page) => window.locator('.index-weights-view')

test('holdings detail opens first, and waits to be run', async ({ window }) => {
  await openHoldings(window, 'TECH10')

  await expect(window.getByRole('radio', { name: 'Holdings Detail' })).toBeChecked()
  await expect(view(window)).toContainText('then run to see the strategy')
  await expect(window.locator('.tbl-body')).toHaveCount(0)

  await view(window).getByRole('button', { name: 'Run', exact: true }).click()

  // The workflow from the universe to the fund, each weight named in full.
  const head = window.locator('.tbl-head')
  for (const name of [
    'Ticker',
    'Universe Weight',
    'Index Weight',
    'Portfolio Weight',
    'Shares Held'
  ]) {
    await expect(head).toContainText(name)
  }
  await expect(head).not.toContainText(/\bw\b/)
  await expect(view(window)).toContainText('in the universe')
  await expect(view(window)).toContainText('weights as of')
})

test('between rebalances, the drift since the last one shows beside both weights', async ({
  window
}) => {
  await openHoldings(window, 'TECH10')
  await view(window).getByRole('textbox', { name: 'As of' }).fill('2024-05-15')
  await view(window).getByRole('button', { name: 'Run', exact: true }).click()

  const head = window.locator('.tbl-head')
  await expect(head).toContainText('Portfolio Weight')
  await expect(head).toContainText('Weight Drift')
  await expect(head).toContainText('Current Portfolio Weight')
})

test('a stage column says what the stage does when hovered', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await view(window).getByRole('button', { name: 'Run', exact: true }).click()

  await window.locator('.tbl-head .header-tip-anchor').first().hover()
  await expect(window.getByRole('tooltip')).toContainText('passed')
})

test('portfolio puts names down and dates across', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(window.locator('.tbl-head')).toContainText('Ticker')
  // Column headers are dates, which is the whole shape of this table.
  await expect(window.locator('.tbl-head')).toContainText(/\d{4}-\d{2}-\d{2}/)
  // Heaviest first, from the fund's own book.
  await expect(window.locator('.tbl-body .tbl-row').first()).toContainText(/CMP\d{3}/)

  // A holding is not a signed quantity: "+12.00%" would claim a direction
  // this number does not have.
  await expect(window.locator('.tbl-body').first()).not.toContainText('+1')
})

test('the index sits beside the portfolio, in a column group a date', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()
  await view(window).getByRole('checkbox', { name: 'Index' }).check()

  await expect(window.locator('.tbl-head')).toContainText('Portfolio')
  await expect(window.locator('.tbl-head')).toContainText('Index')
})

test('the frequency control changes what a cell means, not just its label', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(window.locator('.tbl-head')).toContainText(/\d{4}-\d{2}-\d{2}/)
  const decided = await window.locator('.tbl-head .tbl-cell').count()

  await window.getByRole('radio', { name: 'Monthly' }).click()

  // Held weights, drift included: a different question, and the footnote
  // says so rather than letting the frequency change it silently.
  await expect(view(window)).toContainText('what was held on each date, drift included')
  expect(await window.locator('.tbl-head .tbl-cell').count()).toBeGreaterThan(decided)
})

test('aggregation rolls names into groups and keeps the total', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  // The dimensions come from the reference data, not a declared list, so
  // whatever the engine carries is what can be grouped on.
  await choose(window, 'Aggregate by', 'country_domicile')

  await expect(window.locator('.tbl-head')).toContainText('Group')
  await expect(window.locator('.tbl-body .tbl-row').first()).toContainText(/US|IE|JP/)
  await expect(view(window)).toContainText(/Σ latest\s*\d+\.\d{2}%/)
})

test('active subtracts the benchmark, and the actives sum to zero', async ({ window }) => {
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Active' }).click()

  await expect(view(window)).toContainText('Choose a benchmark')

  await choose(window, 'Benchmark', 'EU-VALUE')

  // Both sides fully invested, so the overweights pay for the underweights.
  await expect(view(window)).toContainText(/Σ active\s*0\.00%/)
  await expect(window.locator('.num-neg').first()).toBeVisible()
  await expect(window.locator('.num-pos').first()).toBeVisible()
})

test('a strategy nobody has run has no history to show, and says which', async ({ window }) => {
  // Holdings over time live in a backtest result, so a strategy still being
  // edited has none. Saying so beats an empty table.
  await openHoldings(window, 'TECH10-OPT')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(view(window)).toContainText('has no run yet')
  await expect(window.locator('.tbl-body')).toHaveCount(0)
})

test('only a strategy with a run is offered as a benchmark', async ({ window }) => {
  // Weights are a run's, so a strategy nobody has run has none to measure
  // against, and offering it would only lead to an empty column.
  await openHoldings(window, 'TECH10')
  await window.getByRole('radio', { name: 'Active' }).click()

  const list = await openSelect(window, 'Benchmark')
  await expect(list.locator('[data-value="EU-VALUE"]')).toHaveCount(1)
  await expect(list.locator('[data-value="TECH10-OPT"]')).toHaveCount(0)
})

test('a record the engine cannot read is a fault, not an absence', async ({ window }) => {
  /*
   * py-beacon #187: the listing names a record whose detail read fails. A
   * pane told "never back-tested" there would be saying something true of
   * the wrong thing, the mistake BU-162 fixed for a failed job.
   */
  await openHoldings(window, 'LEGACY-RUN')
  await window.getByRole('radio', { name: 'Portfolio', exact: true }).click()

  await expect(view(window)).not.toContainText('has no run yet')
  await expect(view(window)).toContainText('Could not load')
})
