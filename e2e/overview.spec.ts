import type { Page } from '@playwright/test'
import { expect, openPage, openView, test, choose } from './fixtures'

/**
 * The Overview's faces (BU-176): a stored strategy's latest run since
 * py-beacon 0.9.0, in Karan's order — Summary, Implementation, Statistics
 * Detail, Risk & Correlation, Flows & AUM.
 *
 * The stub's strategies are plain ones named for the fixture indices they
 * hold, so the ids typed here read as they did when the subject was the
 * index.
 */

async function openOverview(window: Page, strategyId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await openView(window, 'Overview')
  await window
    .locator('.index-overview-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(strategyId)
  await window.keyboard.press('Enter')
}

test('the faces are in Karan’s order', async ({ window }) => {
  await openOverview(window, 'TECH10')

  await expect(window.locator('.overview-faces [role="radio"]')).toHaveText([
    'Summary',
    'Implementation',
    'Statistics Detail',
    'Risk & Correlation',
    'Flows & AUM'
  ])
})

test('summary draws the run, its weights and the index beside it', async ({ window }) => {
  await openOverview(window, 'TECH10')

  await expect(window.getByText('LEVEL', { exact: true })).toBeVisible()
  await expect(window.locator('.level-chart')).toBeVisible()

  // The run is the strategy's; the index line is the index calculated on
  // its own over the same dates (`/indices/{id}/level`), not a second run.
  await expect(window.locator('.level-chart-key')).toContainText('TECH10')
  await expect(window.locator('.index-overview-view')).toContainText('latest run, captured 3d ago')
  await expect(window.locator('.index-overview-view')).toContainText(
    'TECH10 calculated alone over the same dates'
  )

  // Both columns are py-beacon's own metrics: the run's, and the index's.
  const stats = window.locator('.overview-stats-card')
  await expect(stats.getByText('Sharpe ratio')).toBeVisible()
  await expect(stats.getByText('Strategy', { exact: true })).toBeVisible()
  await expect(stats.getByText('Index', { exact: true })).toBeVisible()

  await expect(window.locator('.overview-weight').first()).toContainText('CMP000')
})

test('a strategy never run says so, and offers to back-test it', async ({ window }) => {
  // TECH10-OPT is stored and has no run, and every view is a run's (0.9.0).
  await openOverview(window, 'TECH10-OPT')

  await expect(
    window.getByText('TECH10-OPT has no run yet. Backtest it to see one here.')
  ).toBeVisible()
  await expect(window.locator('.overview-stats-card')).toHaveCount(0)

  await window.getByRole('button', { name: 'Backtest…' }).click()
  await expect(window.locator('.backtest-strategy')).toContainText('TECH10-OPT')
})

test('implementation reads what the fund did that the index did not', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Implementation' }).click()

  // A captured run with screens, a cap, an execution limit and futures on
  // its cash buffer: each record is a table of its own.
  const view = window.locator('.index-overview-view')
  await expect(view.getByText('NAMES REMOVED')).toBeVisible()
  await expect(view).toContainText('Rebalances')
  await expect(view).toContainText('Minimum price')
  await expect(view).toContainText(/Unfilled orders · \d+/)
  await expect(view).toContainText('execution limit')
  await expect(view).toContainText('Index futures')
  // A run with complete data has no stale marks, and says nothing of them.
  await expect(view).not.toContainText('Priced from an earlier session')
})

test('flows and AUM reads the money in, out, and each class', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Flows & AUM' }).click()

  const view = window.locator('.index-overview-view')
  await expect(view.getByText('NAV PER UNIT')).toBeVisible()
  await expect(view).toContainText('Flows')
  await expect(view).toContainText('Share classes')
  await expect(view).toContainText('EUR · hedged')
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

  await choose(window, 'Benchmark', 'EU-VALUE')

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

  await choose(window, 'Series', 'volatility')
  await expect(window.locator('.level-chart-key')).toContainText('volatility · 60d')

  // Rolling correlation has nothing to correlate against until one is picked,
  // and says so rather than drawing an empty chart.
  await choose(window, 'Series', 'correlation')
  await expect(window.getByText('Choose a strategy to correlate against.')).toBeVisible()
})

test('correlations are against the strategies the reader picks', async ({ window }) => {
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

test('a window the calendar narrowed says so, and which end', async ({ window }) => {
  /*
   * BU-205 / BN-198. Karan's rule for py-beacon #211 was refuse if empty,
   * report if partial — and the reporting half is the one that fails in
   * silence. The levels really do span the shorter range, so the chart is
   * correct and answers a smaller question than the one asked.
   *
   * XTKS, XHKG and XBOM refuse to widen past their default bounds where
   * XNYS and XLON go back to 1900, so this is a Tokyo index over a window
   * its calendar cannot reach.
   */
  await openOverview(window, 'EU-VALUE')

  const note = window.locator('.overview-note', { hasText: 'calendar' })
  await expect(note).toContainText('covers 1997-01-06 → 1998-12-31')
  await expect(note).toContainText('not the 1996-01-02 → 1998-12-31 it asked for')

  // The remedy for a trimmed START: those sessions never existed, so the
  // fix is the base date or another calendar — never "wait", which is the
  // advice for the other end.
  await expect(note).toContainText('XTKS has no sessions that early')
  await expect(note).toContainText('move the base date to 1997-01-06')
  await expect(note).not.toContainText('wait')
})

test('an ordinary run says nothing about calendars', async ({ window }) => {
  // Null coverage is the signal. A run that covered what it asked for has
  // nothing to explain, and a notice on every overview would train the
  // reader to skip the one that matters.
  await openOverview(window, 'TECH10')

  await expect(window.locator('.level-chart')).toBeVisible()
  await expect(window.locator('.overview-note', { hasText: 'calendar' })).toHaveCount(0)
})
