import { expect, openPage, test } from './fixtures'

/**
 * Reading a finished backtest (BU-137).
 *
 * The stub answers the submission with a job that is already done and whose
 * result carries BN-155's shape — `index_level` rather than `benchmark_level`,
 * and a null benchmark when none was asked for.
 */
test('draws the portfolio against the index it tracked', async ({ window }) => {
  await openPage(window, 'Beacon View')

  /*
   * Opened from the palette, pinned to an index in one gesture.
   *
   * Backtest is a `pinned` view: the new-tab menu offers it only beside an
   * open document, and it needs an index to run against either way. The
   * intent row — a view and a subject in one query — is the shortest route
   * to both.
   */
  await window.getByRole('combobox', { name: 'Search' }).fill('backtest TECH10')
  await window
    .getByRole('option', { name: /Backtest/ })
    .first()
    .click()

  await window.getByRole('button', { name: 'Run backtest' }).click()

  // Two lines: what the simulation did, and what it was tracking. The second
  // comes from `index_level`, which was `benchmark_level` before BN-155.
  await expect(window.getByText('TECH10 portfolio')).toBeVisible()
  await expect(window.getByText('TECH10 index')).toBeVisible()

  // A run given no benchmark says so rather than reporting a dash.
  await expect(window.getByText('not measured')).toBeVisible()

  await expect(window.getByText(/portfolio NAV against the tracked index/)).toBeVisible()
})

test('a run given a benchmark measures it, and says so', async ({ window }) => {
  await openPage(window, 'Beacon View')
  await window.getByRole('combobox', { name: 'Search' }).fill('backtest TECH10')
  await window
    .getByRole('option', { name: /Backtest/ })
    .first()
    .click()

  await window.getByLabel('Benchmark').selectOption('EU-VALUE')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  // Measured: the "not measured" line belongs to a run that had none, and
  // the two must not read the same (BU-137).
  await expect(window.getByText('not measured')).toHaveCount(0)
  await expect(window.getByText('BENCHMARK CAGR')).toBeVisible()
})
