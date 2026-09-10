import type { Page } from '@playwright/test'
import { expect, openPage, test } from './fixtures'

/**
 * Setting up a backtest (BU-174).
 *
 * The pane is a form: it says what to run, and the Overview says what
 * happened. So these cover the settings reaching the engine and the run
 * being handed over — not a chart, which this pane no longer draws.
 *
 * The stub answers a submission with a job that is already done, since it
 * carries no event socket to push progress over.
 */

/** Open Backtest on an empty Beacon View page and point it at an index. */
async function openBacktest(window: Page, indexId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()

  if (indexId === '') return
  await window.locator('.backtest-view').getByRole('combobox', { name: 'Subject' }).fill(indexId)
  await window.keyboard.press('Enter')
}

test('every setting the engine accepts is on the pane', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  // Start, end and initial capital were not on screen at all before this:
  // the capital was hard-coded in the mutation and the period was whatever
  // py-beacon defaulted to.
  await expect(window.getByLabel('Start')).toBeVisible()
  await expect(window.getByLabel('End')).toBeVisible()
  await expect(window.getByLabel('Transaction cost (bps)')).toBeVisible()
  await expect(window.getByLabel('Initial capital')).toHaveValue('1000000')
  await expect(window.getByLabel('Benchmark')).toBeVisible()

  // And nothing is drawn: performance is read in the Overview (BU-175).
  await expect(window.locator('.level-chart')).toHaveCount(0)
  await expect(window.getByText('CAGR')).toHaveCount(0)
})

test('a finished run hands over to the Overview rather than drawing it', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  // What to know before running it again, from the catalogue of records.
  await expect(window.locator('.backtest-view')).toContainText('last run 3d ago')

  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('Back-tested TECH10.')).toBeVisible()
  await window.getByRole('button', { name: 'Open overview' }).click()

  // The index's own pane, showing the level it always showed.
  await expect(window.locator('.index-overview-view')).toBeVisible()
})

test('a run the form knows the engine would refuse is not sent', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByLabel('Initial capital').fill('0')

  // `initial_capital` is exclusiveMinimum 0 in the schema, so this is the
  // 422 arriving early rather than a rule of this app's own.
  await expect(window.getByText(/Initial capital has to be more than zero/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeDisabled()
})

test('a run that cannot happen says why, in py-beacon’s own words', async ({ window }) => {
  /*
   * BN-161 made an unresolvable universe a FAILURE rather than a dead level
   * of zero, and this app had nowhere to put one: the pane fell through to
   * "no backtest run yet", and the tray clipped four hundred characters of
   * explanation at the width of a card (BU-162).
   */
  await openBacktest(window, 'NO-UNIVERSE')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('The backtest did not run.')).toBeVisible()
  await expect(window.getByText(/universe_identifiers/).first()).toBeVisible()

  // And no success state behind it: a run that failed was not handed over.
  await expect(window.getByRole('button', { name: 'Open overview' })).toHaveCount(0)

  // The tray's half of this is a unit test: it is fed by the event socket,
  // and the stub has none — every job here is finished on arrival.
})

test('opens on an empty page and picks its own index', async ({ window }) => {
  /*
   * BU-164. Backtest was a `pinned` view, so the tab menu offered it only
   * beside an open document — and the only document view in the app is on
   * another page, which left every entry on Beacon View greyed out for good
   * (BU-163). It holds its own subject now.
   */
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()

  const entry = window.getByRole('menuitem', { name: 'Backtest', exact: true })
  await expect(entry).toBeEnabled()
  await entry.click()

  await expect(window.getByText('Choose an index to back-test.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeDisabled()

  await window.locator('.backtest-view').getByRole('combobox', { name: 'Subject' }).fill('TECH10')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeEnabled()
})

test('says what is known about the last run, and no more', async ({ window }) => {
  await openBacktest(window, 'TECH10-OPT')
  await expect(window.locator('.backtest-view')).toContainText('never back-tested')

  // A record py-beacon never stamped (BN-162) is "back-tested" without a
  // date: inventing one from the file would be a guess dressed as data.
  await window.locator('.backtest-view').getByRole('combobox', { name: 'Subject' }).fill('EU-VALUE')
  await window.keyboard.press('Enter')
  await expect(window.locator('.backtest-view')).toContainText('· back-tested')
})

test('optimising first makes a real index, and runs that one', async ({ window }) => {
  /*
   * BU-174. There is no `optimised` flag in `BacktestRequest`, and there
   * should not be: optimising produces an INDEX. So the box composes two
   * calls the engine already has — derive a child, then back-test the child.
   */
  await openBacktest(window, 'TECH10')

  await window.getByRole('checkbox', { name: 'Optimise first' }).check()

  // The child's identity is suggested from the parent, and both boxes stay
  // editable: a suggestion that could not be changed would be a rule.
  await expect(window.getByLabel('Optimised index id')).toHaveValue('TECH10-OPT')
  await window.getByLabel('Optimised index id').fill('TECH10-MINTE')

  // The same constraint list the derivation editor uses, since py-beacon
  // stores one row shape for both (BU-170).
  await window.getByRole('button', { name: /Add constraint/ }).click()
  await expect(window.locator('.constraint-row')).toHaveCount(1)

  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText(/Back-tested TECH10-MINTE, solved from TECH10/)).toBeVisible()

  // Saved, not notional: the child is a document like any other. It opens
  // on Strategy Builder, where index definitions live — pages are separate
  // workspaces, so the tab lands there and the page has to be turned to.
  await window.getByRole('button', { name: 'Open TECH10-MINTE' }).click()
  await openPage(window, 'Strategy Builder')
  await expect(window.getByText('Derived from')).toBeVisible()
  await expect(window.getByRole('button', { name: /TECH10 →/ })).toBeVisible()
})

test('an index that is already optimised is not optimised again', async ({ window }) => {
  await openBacktest(window, 'TECH10-OPT')

  // A solve on top of a solved index would be a third document nobody asked
  // for, so the terms shown are this index's own.
  const box = window.getByRole('checkbox', { name: 'Already optimised' })
  await expect(box).toBeChecked()
  await expect(box).toBeDisabled()
  await expect(window.getByLabel('Optimised index id')).toHaveCount(0)
  await expect(window.locator('.backtest-view')).toContainText('min_tracking_error')
})

test('an optimised index can be the benchmark, which is the point of one', async ({ window }) => {
  /*
   * BU-172. py-beacon refused a derived index as a benchmark until its #182
   * — an accident of resolution rather than a rule, since a benchmark needs
   * nothing but a level series. The comparison it blocked is the one the
   * whole feature is for: a parent against its own optimised child answers
   * "what did the constraints cost?".
   */
  await openBacktest(window, 'TECH10')

  const benchmark = window.getByLabel('Benchmark')
  await expect(benchmark.locator('option', { hasText: 'TECH10-OPT' })).toHaveCount(1)

  await benchmark.selectOption('TECH10-OPT')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('Back-tested TECH10.')).toBeVisible()
})
