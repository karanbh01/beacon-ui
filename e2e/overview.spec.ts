import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * The Overview's faces (BU-176): a stored strategy's latest run since
 * py-beacon 0.9.0, in Karan's order — Summary, Performance, Risk &
 * Correlation, Flows & AUM, Implementation.
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
    'Performance',
    'Risk & Correlation',
    'Flows & AUM',
    'Implementation'
  ])
})

test('summary draws the run, the index beside it, and the engine’s figures', async ({ window }) => {
  await openOverview(window, 'TECH10')

  const view = window.locator('.index-overview-view')
  // What the backtest is, then its holdings, style and headline figures (BU-294).
  await expect(view.locator('.summary-title-label')).toHaveText(['Backtest', 'Index', 'Benchmark'])
  // How risky it is beside its names: rating across, tracking band up (Karan, 2026-11-20).
  await expect(view.locator('.risk-box-plot svg')).toBeVisible()
  await expect(view.locator('.risk-box-sides')).toContainText('Unconstrained')
  await expect(view.locator('.holdings-bar-track')).toBeVisible()
  await expect(view.locator('.style-box-plot svg')).toBeVisible()
  await expect(view).toContainText('Headline statistics')
  await expect(view.getByText('Total return', { exact: true }).first()).toBeVisible()
  await expect(window.locator('.level-chart').first()).toBeVisible()

  // The strategy's line, its index's, and the run's benchmark.
  await expect(window.locator('.level-chart-legend').first()).toContainText('TECH10')
  await expect(window.locator('.level-chart-legend').first()).toContainText('benchmark')
  await expect(view).toContainText('latest run, captured 3d ago')

  // Every figure is py-beacon's, by trailing period, and against the comparators.
  await expect(view).toContainText('Summary statistics')
  await expect(view.locator('.summary-table')).toContainText('Sharpe ratio')
  await expect(view.locator('.summary-table')).toContainText('Tracking difference')
  await expect(view.locator('.summary-table')).toContainText('SI')
})

test('a strategy never run says so, and offers to back-test it', async ({ window }) => {
  // TECH10-OPT is stored and has no run, and every view is a run's (0.9.0).
  await openOverview(window, 'TECH10-OPT')

  await expect(
    window.getByText('TECH10-OPT has no run yet. Backtest it to see one here.')
  ).toBeVisible()
  await expect(window.locator('.index-overview-view')).not.toContainText('Summary statistics')

  await window.getByRole('button', { name: 'Backtest…' }).click()
  await expect(window.locator('.backtest-strategy')).toContainText('TECH10-OPT')
})

test('implementation reads what the fund did that the index did not', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Implementation' }).click()

  // A captured run with screens, a cap, an execution limit, futures on its
  // cash buffer and a hedged class.
  const view = window.locator('.index-overview-view')
  await expect(view.getByText('NAMES REMOVED')).toBeVisible()
  await expect(view).toContainText('Rebalances')
  await expect(view).toContainText('Minimum price')
  // A rebalance's removed, capped and unfilled names open under it, one list
  // at a time, and close again (Karan, 2026-11-20).
  await expect(view).not.toContainText('execution limit')
  await view.locator('[role="row"][aria-expanded="false"]').first().click()
  const detail = view.locator('.tbl-expanded')
  await expect(detail).toContainText('Minimum price')
  await detail.getByRole('radio', { name: /^Capped \d+$/ }).click()
  await expect(detail).toContainText('Capped at')
  await detail.getByRole('radio', { name: /^Unfilled \d+$/ }).click()
  await expect(detail).toContainText('execution limit')
  await view.locator('[role="row"][aria-expanded="true"]').click()
  await expect(detail).toHaveCount(0)
  // Each rebalance's counts and cash, charted beside the table.
  await expect(view.locator('.stacked-bars-bar')).not.toHaveCount(0)
  // The derivatives side by side, each named by its legend, its record under it.
  await expect(view).toContainText('Index futures')
  await expect(view).toContainText('Futures exposure, % of NAV')
  await expect(view).toContainText('Share-class hedges')
  await expect(view).toContainText('Back to band')
  // A run with complete data has no stale marks, and says nothing of them.
  await expect(view).not.toContainText('Priced from an earlier session')
})

test('flows and AUM reads the money in, out, and each class', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Flows & AUM' }).click()

  // The assets and the flows charted on the left, their tables on the right
  // (Karan, 2026-11-20); no figures strip and no NAV chart.
  const view = window.locator('.index-overview-view')
  await expect(view.getByText('NAV PER UNIT', { exact: true })).toHaveCount(0)
  await expect(view).toContainText('Assets under management')
  await expect(view).toContainText('AUM, USD')
  await expect(view.locator('.stacked-bars-bar')).not.toHaveCount(0)
  await expect(view).toContainText('AUM by share class')
  await expect(view).toContainText('EUR · hedged')
  await expect(view).toContainText('Paid to the fund')
})

test('performance tables every figure by period, the fund beside what it is measured on', async ({
  window
}) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()

  // One table, as Summary's: since inception and each year a group of columns.
  const table = window.locator('.performance-face .tbl')
  await expect(table).toContainText('SI')
  await expect(table).toContainText('2025')
  for (const book of ['Fund', 'Index', 'BM']) await expect(table).toContainText(book)
  const view = window.locator('.index-overview-view')
  await expect(view).not.toContainText('Against the benchmark')

  // Returns open, the other groups folded until asked for.
  await expect(table).toContainText('Total return')
  await expect(table).not.toContainText('Volatility')
  for (const group of ['Risk-adjusted', 'Tracking', 'Regression']) {
    await window.getByRole('button', { name: group, exact: true }).click()
  }
  for (const label of ['Information ratio', 'Tracking error', 'Sortino ratio', 'Alpha', 'R²']) {
    await expect(view).toContainText(label)
  }
})

test('relative figures run back from the last day, each window a group of columns', async ({
  window
}) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()
  await window.getByRole('radio', { name: 'Relative' }).click()

  const groups = window.locator('.performance-face .tbl-group')
  for (const label of ['SI', '1M', '3M', 'YTD', '1Y']) {
    await expect(groups.filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(1)
  }
})

test('a month is too short for the ratios, so they are since inception only', async ({
  window
}) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()
  await window.getByRole('button', { name: 'Risk-adjusted', exact: true }).click()
  const sortino = window.locator('.performance-face [role="row"]', { hasText: 'Sortino ratio' })
  await expect(sortino).toContainText(/\d\.\d\d.*\d\.\d\d.*\d\.\d\d/)

  await window.getByRole('radio', { name: 'Monthly' }).click()
  // Figures since inception, then a dash for every month.
  await expect(sortino).toHaveText(/^Sortino ratio(-?\d+\.\d\d)+—+$/)
})

test('a period pointed at in the returns is drawn in the regression', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()

  const legend = window.locator('.regression-legend')
  await expect(legend).toContainText('Since inception · beta')
  await expect(legend).not.toContainText('2024')
  await expect(window.locator('.regression-lit')).toHaveCount(0)

  // The bars for 2024 are the second group of three years.
  await window.locator('.grouped-bars-open').nth(1).hover()
  await expect(legend).toContainText('2024 · beta')
  await expect(window.locator('.regression-lit')).not.toHaveCount(0)
})

test('months the pane has no room for are a step back', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()
  await window.getByRole('radio', { name: 'Monthly' }).click()

  // About thirty-six months: the newest across, the rest earlier, never a sideways scroll.
  const range = window.locator('.performance-range')
  const newest = await range.textContent()
  await window.getByRole('button', { name: 'Earlier' }).click()
  await expect(range).not.toHaveText(newest ?? '')
  await window.getByRole('button', { name: 'Later' }).click()
  await expect(range).toHaveText(newest ?? '')
})

test('the period choice survives a move between faces', async ({ window }) => {
  // The period is held above the faces, so leaving Performance and coming back keeps it.
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Performance' }).click()
  await window.getByRole('radio', { name: 'Quarterly' }).click()

  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()
  await window.getByRole('radio', { name: 'Performance' }).click()
  await expect(window.getByRole('radio', { name: 'Quarterly' })).toBeChecked()
})

test('risk shows the frontier, the crises and the return distribution', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()

  const view = window.locator('.index-overview-view')
  await expect(window.locator('.frontier-chart')).toBeVisible()

  // The VaR line follows the level picked beside the distribution.
  const distribution = window.locator('.distribution')
  await expect(distribution).toContainText(/VaR 95% · \d/)
  await window.getByRole('radio', { name: '99%' }).click()
  await expect(distribution).toContainText(/VaR 99% · \d/)

  // A crisis before the run keeps its row and says so; one the run saw opens to its chart.
  const crises = window.locator('.crisis-table')
  await expect(crises).toContainText('Before the run')
  await expect(view.locator('.crisis-chart')).toHaveCount(0)
  await crises.locator('[role="row"]', { hasText: 'tariff' }).click()
  await expect(view.locator('.crisis-chart')).toBeVisible()
})

test('the risk figures and the shape of returns are tabled by period', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()

  const tables = window.locator('.risk-figures')
  await expect(tables).toHaveCount(2)
  const [risk, shape] = [tables.nth(0), tables.nth(1)]
  for (const period of ['1Y', '3Y', '5Y', 'SI']) await expect(risk).toContainText(period)
  for (const label of ['Volatility', 'Max drawdown', 'Beta', 'Down capture']) {
    await expect(risk).toContainText(label)
  }
  // Tail ratio is the distribution's, so it sits under that and not under the frontier.
  await expect(risk).not.toContainText('Tail ratio')
  for (const label of ['Tail ratio', 'Skew', 'Excess kurtosis']) {
    await expect(shape).toContainText(label)
  }
  await expect(risk.getByRole('columnheader', { name: 'Fund' }).first()).toBeVisible()
})

test('a column picked in the matrix is charted in the rolling correlation', async ({ window }) => {
  await openOverview(window, 'TECH10')
  await window.getByRole('radio', { name: 'Risk & Correlation' }).click()

  const legend = window.locator('.risk-correlation .level-chart-legend')
  await expect(legend).toContainText('Global equity (ACWI)')
  await expect(legend).not.toContainText('Gold')

  const gold = window.getByRole('button', { name: 'Gold', exact: true })
  await gold.click()
  await expect(gold).toHaveAttribute('aria-pressed', 'true')
  await expect(legend).toContainText('Gold (GLD)')

  // A volatility range beside each of the matrix's rows.
  const rows = await window.locator('.heatmap-row-head').count()
  expect(rows).toBeGreaterThan(0)
  await expect(window.locator('.volatility-range')).toHaveCount(rows)
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
