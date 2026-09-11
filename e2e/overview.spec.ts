import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * The Overview's three faces (BU-176).
 *
 * Also the first E2E coverage this pane has ever had: the stub served no
 * `/beacon/{id}/overview`, no `/beacon/compare` and no `/beacon/{id}/weights`
 * until BU-165, so every view reading them fell to its error state and the
 * payloads were described rather than exercised.
 */

async function openOverview(window: Page, indexId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await openView(window, 'Overview')
  await window
    .locator('.index-overview-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(indexId)
  await window.keyboard.press('Enter')
}

test('summary draws the index, its weights and the run beside it', async ({ window }) => {
  await openOverview(window, 'TECH10')

  await expect(window.getByText('INDEX LEVEL')).toBeVisible()
  await expect(window.locator('.level-chart')).toBeVisible()

  // The stored run lands here now, not on the Backtest tab (BU-174/175).
  await expect(window.getByText('TECH10 portfolio')).toBeVisible()
  await expect(window.locator('.index-overview-view')).toContainText('stored run, captured 3d ago')

  // The index column is py-beacon's own metrics; the portfolio column is the
  // run's. Both present means the table is telling two stories, not one.
  const stats = window.locator('.overview-stats-card')
  await expect(stats.getByText('Sharpe ratio')).toBeVisible()
  await expect(stats.getByText('Portfolio')).toBeVisible()

  await expect(window.locator('.overview-weight').first()).toContainText('CMP000')
})

test('an index nobody has run shows no portfolio column', async ({ window }) => {
  // TECH10-OPT has no stored record. An empty column would read as a
  // measurement that came out blank rather than one nobody made.
  await openOverview(window, 'TECH10-OPT')

  await expect(window.locator('.overview-stats-card')).toBeVisible()
  await expect(window.locator('.overview-stats-card').getByText('Portfolio')).toHaveCount(0)
  await expect(window.getByText('TECH10-OPT portfolio')).toHaveCount(0)
})

test('statistics detail buckets returns, and the period control changes them', async ({
  window
}) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Statistics Detail' }).click()

  await expect(window.getByText('ANNUAL RETURNS')).toBeVisible()
  const annual = await window.locator('.tbl-body .tbl-row').count()

  await window.getByRole('radio', { name: 'Monthly' }).click()
  await expect(window.getByText('MONTHLY RETURNS')).toBeVisible()

  // Three years of daily levels is three annual buckets and about thirty-six
  // monthly ones: the control changes the question, not just the label.
  expect(await window.locator('.tbl-body .tbl-row').count()).toBeGreaterThan(annual)
})

test('a benchmark adds the columns it can fill, and nothing before that', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Statistics Detail' }).click()

  // Nothing to compare against yet, so no excess column standing empty.
  await expect(window.locator('.tbl-head')).not.toContainText('Excess')
  await expect(window.locator('.index-overview-view')).toContainText('pick a benchmark')

  await window.getByLabel('Benchmark').selectOption('EU-VALUE')

  await expect(window.locator('.tbl-head')).toContainText('Excess')
  await expect(window.locator('.tbl-head')).toContainText('EU-VALUE')
  // An information ratio needs a benchmark, and now it has one.
  await expect(window.locator('.index-overview-view')).not.toContainText('pick a benchmark')
})

test('the period choice survives a move between faces', async ({ window }) => {
  // Period and benchmark are the same question asked on two faces, so the
  // answer is held above both of them.
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Statistics Detail' }).click()
  await window.getByRole('radio', { name: 'Quarterly' }).click()

  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()
  await expect(window.getByRole('radio', { name: 'Quarterly' })).toBeChecked()
  await expect(window.getByText('QUARTERLY RISK')).toBeVisible()
})

test('risk shows one chart with three series behind a selector', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()

  await expect(window.locator('.index-overview-view')).toContainText('VaR · historical')
  await expect(window.locator('.index-overview-view')).toContainText('expected shortfall')

  // One plot, not three stacked down the pane.
  await expect(window.locator('.level-chart')).toHaveCount(1)
  await expect(window.getByText('drawdown', { exact: true })).toBeVisible()

  await window.getByLabel('Series').selectOption('volatility')
  await expect(window.locator('.level-chart-key')).toContainText('volatility · 60d')

  // Rolling correlation has nothing to correlate against until one is picked,
  // and says so rather than drawing an empty chart.
  await window.getByLabel('Series').selectOption('correlation')
  await expect(window.getByText('Choose an index to correlate against.')).toBeVisible()
})

test('correlations are against the indices the reader picks', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()

  await expect(
    window.getByText('Nothing chosen. Correlation needs something to correlate against.')
  ).toBeVisible()

  await window.getByRole('button', { name: 'Correlate against' }).click()
  await window.getByRole('checkbox', { name: 'EU-VALUE' }).check()
  await window.keyboard.press('Escape')

  const correlation = window.locator('.overview-stats-card').last()
  await expect(correlation).toContainText('EU-VALUE')
  // A real number, computed from returns on the dates both series share.
  await expect(correlation.locator('.tbl-row').first()).toContainText(/[01]\.\d{3}|−0\.\d{3}/)
})
