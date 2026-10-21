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
  // Chosen from the saved strategies, as a new index is named (0.2.1).
  await window.getByRole('button', { name: 'New backtest…' }).click()
  await choose(window, 'Strategy', strategyId)
  await window.getByRole('button', { name: 'Set up', exact: true }).click()
}

test('with no strategy named it lists the runs, newest first (Karan)', async ({ window }) => {
  await openBacktest(window, '')

  const runs = window.locator('.backtest-runs')
  await expect(runs).toContainText('Runs · 4')
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

  await expect(window.getByRole('combobox', { name: 'Preset' })).toBeVisible()
  await expect(window.getByRole('button', { name: /Add share class/ })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Capital and flows…' })).toBeVisible()
  await expect(window.getByLabel('Start', { exact: true })).toBeVisible()
  await expect(window.getByLabel('End', { exact: true })).toBeVisible()
  await expect(window.getByLabel('Transaction cost (bps)')).toBeVisible()
  await expect(window.getByLabel('Benchmark', { exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Modelling assumptions…' })).toBeVisible()

  // And nothing is drawn: performance is read in the Overview (BU-175).
  await expect(window.locator('.level-chart')).toHaveCount(0)
})

test('a strategy run before opens on the settings of its last run', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await expect(
    window.getByText(/These settings come from the last backtest of TECH10/)
  ).toBeVisible()
  await expect(window.locator('.backtest-view')).toContainText('B · distributing · hedged')

  await window.getByRole('button', { name: 'Start afresh' }).click()
  await expect(window.getByText(/These settings come from the last backtest/)).toHaveCount(0)
})

test('a finished run hands over to the Overview rather than drawing it', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('The backtest for TECH10 has finished.')).toBeVisible()
  await window.getByRole('button', { name: 'Open overview' }).click()
  await expect(window.locator('.index-overview-view')).toBeVisible()
})

test('the vehicle, its classes, their capital and flows reach the engine as set', async ({
  window
}) => {
  let body: Record<string, unknown> | undefined
  await window.route(/\/strategies\/TECH10\/backtest$/, async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>
    await route.continue()
  })

  // The last run's settings: a UK OEIC with a hedged EUR class and flows.
  await openBacktest(window, 'TECH10')
  await window.getByRole('button', { name: 'Run backtest' }).click()
  await expect(window.getByText('The backtest for TECH10 has finished.')).toBeVisible()

  expect(body).toMatchObject({
    vehicle: { preset: 'uk_oeic' },
    share_classes: expect.arrayContaining([
      expect.objectContaining({ name: 'B', currency: 'EUR', hedged: true })
    ]),
    initial_capital: { A: 300_000_000, B: 100_000_000 },
    flows: { A: [expect.objectContaining({ type: 'DatedFlows' })] }
  })
})

test('validate asks the engine what it would run', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByRole('button', { name: 'Validate' }).click()
  await expect(window.getByText('No problems found. The backtest is ready to run.')).toBeVisible()
})

test('a run the form knows the engine would refuse is not sent', async ({ window }) => {
  await openBacktest(window, 'TECH10')

  await window.getByLabel('Start', { exact: true }).fill('2025-12-31')
  await window.getByLabel('End', { exact: true }).fill('2023-01-31')

  await expect(window.getByText('The start date is after the end date.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeDisabled()
})

test('a strategy deleted under its tab says so, and offers nothing to run', async ({
  app,
  window
}) => {
  // Chosen from the saved strategies since 0.2.1, a backtest can only point at
  // a missing one when the strategy goes after its tab opened.
  await openBacktest(window, 'EU-VALUE')
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false })
  })
  await openPage(window, 'Strategy Builder')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Strategy', exact: true }).click()
  await window.getByRole('button', { name: 'Delete EU-VALUE' }).click()
  await expect(window.getByText(/Deleted EU-VALUE/)).toBeVisible()

  await openPage(window, 'Beacon View')
  await expect(window.getByText(/no saved strategy called EU-VALUE/)).toBeVisible()
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

test('the capital and flows table narrows with a side-by-side pane (0.2.1)', async ({
  app,
  window
}) => {
  // The narrowest window the app allows, split in two: narrower than the
  // table's own columns, which it held to and ran past the pane.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 900)
  })
  await openBacktest(window, 'TECH10')
  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  await window.keyboard.press('Escape')

  const table = window
    .locator('[data-pane="0"] section', { hasText: 'Capital and flows' })
    .locator('.tbl')
    .first()
  await expect(table).toBeVisible()
  const pane = await window.locator('[data-pane="0"] .pane-body').boundingBox()
  const box = await table.boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? Infinity)).toBeLessThanOrEqual(
    (pane?.x ?? 0) + (pane?.width ?? 0)
  )
})

test('a backtest starts from New backtest, as an index does (0.2.1)', async ({ window }) => {
  await openBacktest(window, '')

  // The runs are the page; a new one is chosen from the saved strategies.
  await expect(window.locator('.backtest-runs')).toBeVisible()
  await window.getByRole('button', { name: 'New backtest…' }).click()
  await expect(window.getByRole('button', { name: 'Set up', exact: true })).toBeDisabled()
  await choose(window, 'Strategy', 'EU-VALUE')
  await window.getByRole('button', { name: 'Set up', exact: true }).click()

  await expect(window.locator('.backtest-strategy')).toContainText('EU-VALUE')
  await window.getByRole('button', { name: 'Back to all runs' }).click()
  await expect(window.locator('.backtest-runs')).toBeVisible()
})
