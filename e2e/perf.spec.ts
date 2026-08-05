import { expect, openPage, openView, test } from './fixtures'

/**
 * Budgets, not benchmarks.
 *
 * Each number below is set well above what the app currently does, because a
 * budget tuned to today's measurement fails on a slower machine and teaches
 * everyone to ignore it. These exist to catch a REGRESSION of the kind that
 * changes the shape of the work — a virtualiser accidentally rendering every
 * row, a chart redrawing per frame — not to police a few milliseconds.
 *
 * The measured values at the time of writing are in the comments, so the
 * headroom is visible and a future tightening is an informed decision.
 */

/**
 * Prices, not Universe, because `VIRTUALIZE_ABOVE` is 200 and the stub's
 * universe is 120 names — a table that renders all of them is behaving
 * correctly. The stub serves 240 daily bars, which is the only thing in the
 * fixture on the virtualised side of that threshold.
 */
const BARS = 240
const ROWS_BUDGET = 80
const TABLE_RENDER_BUDGET_MS = 1_500

/** Open Prices on a ticker and wait for the first bar. */
async function openPrices(window: import('@playwright/test').Page): Promise<void> {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()
}

test('the virtualised table renders a window, not the whole list', async ({ window }) => {
  await openPrices(window)

  const rows = await window.locator('.tbl-row').count()

  // Roughly 20 bars fit the viewport, plus 12 of overscan. The failure this
  // guards against is virtualisation silently switching off, which shows up
  // as 240 and would still look correct on screen.
  expect(rows, `${String(rows)} of ${String(BARS)} rows in the DOM`).toBeLessThan(ROWS_BUDGET)
  expect(rows).toBeGreaterThan(0)
})

test('opening a large table stays within budget', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Prices')

  const started = Date.now()
  await window.getByRole('combobox', { name: 'Subject' }).fill('CMP000')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()
  const elapsed = Date.now() - started

  // Measured ~250ms on this machine, against a stub that answers instantly.
  // The budget is deliberately loose.
  expect(elapsed, `took ${String(elapsed)}ms`).toBeLessThan(TABLE_RENDER_BUDGET_MS)
})

test('scrolling the table does not grow the DOM without bound', async ({ window }) => {
  await openPrices(window)

  const before = await window.locator('.tbl-row').count()
  await window.locator('.tbl-body').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await window.waitForTimeout(300)
  const after = await window.locator('.tbl-row').count()

  // A virtualiser recycles; a broken one accumulates. The window should stay
  // the same size at the bottom of the list as at the top.
  expect(after).toBeLessThan(ROWS_BUDGET)
  expect(Math.abs(after - before)).toBeLessThan(ROWS_BUDGET)
})

test('a theme swap repaints without a long task', async ({ window }) => {
  // The tokens exist so a theme change is a CSS variable swap and nothing
  // re-renders. If that ever becomes a React re-render of every view, this is
  // where it shows up.
  await openPage(window, 'Data Explorer')
  await openView(window, 'Data Coverage')
  await window.locator('.stat').first().waitFor()

  const elapsed = await window.evaluate(() => {
    const started = performance.now()
    document.documentElement.dataset.theme = 'light'
    // Force style and layout to flush before stopping the clock.
    void document.body.offsetHeight
    return performance.now() - started
  })

  // Measured ~2ms. 200 is not a tight budget; it is a tripwire for the swap
  // becoming a render.
  expect(elapsed, `theme swap took ${elapsed.toFixed(1)}ms`).toBeLessThan(200)
})
