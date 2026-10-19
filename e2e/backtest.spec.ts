import type { Page } from '@playwright/test'
import { choose, expect, openPage, test } from './fixtures'

/**
 * Backtesting a stored strategy (BU-174; py-beacon 0.9.0).
 *
 * The strategy is written in Strategy Builder; this pane runs it — the
 * vehicle, the money, the period — and with no strategy named, lists the
 * runs the engine kept. What a run DID is read in the Overview, so these
 * cover the settings reaching the engine and the run being handed over.
 *
 * The stub answers a submission with a job that is already done, since it
 * carries no event socket to push progress over. Its strategies are plain
 * ones named for the fixture indices they hold.
 */

/** Open Backtest on an empty Beacon View page, pointed at a strategy if named. */
async function openBacktest(window: Page, strategyId: string): Promise<void> {
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()

  if (strategyId === '') return
  await window.locator('.backtest-view').getByRole('combobox', { name: 'Subject' }).fill(strategyId)
  await window.keyboard.press('Enter')
}

test('with no strategy named it lists the runs, newest first (Karan)', async ({ window }) => {
  await openBacktest(window, '')

  const runs = window.locator('.backtest-runs')
  await expect(runs).toContainText('Runs · 3')
  // Stamped runs date themselves; one py-beacon never stamped (BN-162)
  // says only that it happened.
  await expect(runs.locator('.tbl-row').first()).toContainText('TECH10')
  await expect(runs.locator('.tbl-row').first()).toContainText('3d ago')
  await expect(runs).toContainText('back-tested')

  // A row opens that strategy's setup, ready to run again.
  await runs.getByText('EU-VALUE', { exact: true }).first().click()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeEnabled()
  await expect(window.locator('.backtest-strategy')).toContainText('EU-VALUE')
})

test('every setting the engine accepts is on the pane', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await expect(window.getByLabel('Start')).toBeVisible()
  await expect(window.getByLabel('End')).toBeVisible()
  await expect(window.getByLabel('Transaction cost (bps)')).toBeVisible()
  await expect(window.getByLabel('Initial capital')).toHaveValue('1000000')
  await expect(window.getByLabel('Benchmark', { exact: true })).toBeVisible()
  await expect(window.getByRole('combobox', { name: 'Preset' })).toBeVisible()
  await expect(window.getByRole('button', { name: /Add share class/ })).toBeVisible()
  await expect(window.getByRole('button', { name: /Add flows/ })).toBeVisible()

  // And nothing is drawn: performance is read in the Overview (BU-175).
  await expect(window.locator('.level-chart')).toHaveCount(0)
})

test('a finished run hands over to the Overview rather than drawing it', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('Back-tested TECH10.')).toBeVisible()
  await window.getByRole('button', { name: 'Open overview' }).click()
  await expect(window.locator('.index-overview-view')).toBeVisible()
})

test('a preset vehicle, a hedged class and a flow reach the engine as set', async ({ window }) => {
  let body: Record<string, unknown> | undefined
  await window.route(/\/strategies\/TECH10\/backtest$/, async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>
    await route.continue()
  })

  await openBacktest(window, 'TECH10')
  await choose(window, 'Preset', 'uk_oeic')

  await window.getByRole('button', { name: /Add share class/ }).click()
  // Scoped: the vehicle has a Name of its own.
  const shareClass = window.locator('.backtest-class')
  await shareClass.getByLabel('Name', { exact: true }).fill('B')
  await shareClass.getByLabel('Currency', { exact: true }).fill('EUR')
  await choose(window, 'Hedged into its currency', 'true')

  await window.getByRole('button', { name: /Add flows/ }).click()
  await window.getByLabel('Flow date 1').fill('2024-03-01')
  await window.getByLabel('Flow amount 1').fill('250000')

  await window.getByRole('button', { name: 'Run backtest' }).click()
  await expect(window.getByText('Back-tested TECH10.')).toBeVisible()

  expect(body).toMatchObject({
    vehicle: { preset: 'uk_oeic', settings: {} },
    share_classes: [{ name: 'B', currency: 'EUR', hedged: true }],
    initial_capital: { B: 1_000_000 },
    flows: { B: [{ type: 'DatedFlows', params: { amounts: { '2024-03-01': 250_000 } } }] }
  })
})

test('validate asks the engine what it would run', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByRole('button', { name: 'Validate' }).click()
  await expect(window.getByText('The engine would run this as set.')).toBeVisible()
})

test('a run the form knows the engine would refuse is not sent', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByLabel('Initial capital').fill('0')

  await expect(window.getByText(/Initial capital has to be more than zero/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeDisabled()
})

test('a name no strategy has says so, and offers nothing to run', async ({ window }) => {
  await openBacktest(window, 'NOT-A-STRATEGY')

  await expect(window.getByText(/No stored strategy is called NOT-A-STRATEGY/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toHaveCount(0)
})

test('a run that cannot happen says why, in py-beacon’s own words', async ({ window }) => {
  /*
   * BN-161 made an unresolvable universe a FAILURE rather than a dead level
   * of zero (BU-162), headed by what KIND of failure it was (BU-207).
   */
  await openBacktest(window, 'NO-UNIVERSE')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('The engine refused to answer.')).toBeVisible()
  await expect(window.getByText(/universe_identifiers/).first()).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open overview' })).toHaveCount(0)
})

test('a run that cannot value a constituent fails, and names the pair', async ({ window }) => {
  // py-beacon #204 (BN-191): an index can preview cleanly and fail here.
  await openBacktest(window, 'FX-NOVALUE')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('The engine refused to answer.')).toBeVisible()
  await expect(window.getByText(/no JPY\/USD rate/).first()).toBeVisible()
  await expect(window.getByText(/silently restates the index/).first()).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open overview' })).toHaveCount(0)
})

test('a job that crashed is headed as a fault, not as a decision', async ({ window }) => {
  // BN-199 / BU-207: one envelope for a refusal and a crash, one renderer.
  await window.route(/\/jobs\/[^/]+$/, async (route) => {
    const response = await route.fetch()
    const job = (await response.json()) as Record<string, unknown>
    await route.fulfill({
      json: {
        ...job,
        status: 'failed',
        error: {
          code: 'UNEXPECTED_CALCULATION_FAILURE',
          message: "Calculation 'backtest' failed with an unexpected KeyError: 'CMP999'.",
          detail: { original_type: 'KeyError' }
        }
      }
    })
  })

  await openBacktest(window, 'TECH10')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('The engine broke on this calculation.')).toBeVisible()
  await expect(window.getByText(/Raised a KeyError/)).toBeVisible()
  await expect(window.getByText('The engine refused to answer.')).toHaveCount(0)
})
