import { expect, openPage, openView, test } from './fixtures'

/**
 * The Constituent Preview as a job (BU-186).
 *
 * It used to resolve the whole pipeline on open, and again on every
 * keystroke in the date field. A preview is a request against a date
 * somebody chose, so nothing runs until it is asked for.
 */
async function openPreview(
  window: import('@playwright/test').Page,
  indexId: string
): Promise<void> {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText(indexId, { exact: true }).click()
  await window.getByRole('button', { name: /Constituent Preview/ }).click()
}

test('nothing resolves until a date is chosen and Run is pressed', async ({ window }) => {
  await openPreview(window, 'TECH10')

  await expect(window.getByText(/Choose a date to resolve this index at/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run preview' })).toBeDisabled()
  // No table, because nothing was asked for.
  await expect(window.locator('.tbl-body')).toHaveCount(0)

  await window.getByLabel('As of').fill('2025-06-30')
  await expect(window.getByRole('button', { name: 'Run preview' })).toBeEnabled()
  // Still nothing: a date is not a request.
  await expect(window.locator('.tbl-body')).toHaveCount(0)

  await window.getByRole('button', { name: 'Run preview' }).click()
  await expect(window.locator('.tbl-body').first()).toBeVisible()
  await expect(window.getByText(/asked 2025-06-30/)).toBeVisible()
})

test('the portfolio is at the top, heaviest first', async ({ window }) => {
  await openPreview(window, 'TECH10')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  const rows = window.locator('.tbl-body .tbl-row')
  await expect(rows.first()).toBeVisible()

  // The two capped names carry 12% against everyone else's 9.5%, so they
  // lead — rank order used to put whatever the universe listed first.
  await expect(rows.first()).toContainText('12.00%')
  // And the excluded names are last, however the included ones sort.
  await expect(rows.last()).toContainText('CMP012')
})

test('a market-cap index shows both caps, and says when it fell back', async ({ window }) => {
  /*
   * py-beacon's MarketCapWeighted needs SHARES_OUTSTANDING to price a
   * name. Without it every cap is zero, it assigns EQUAL weights, and it
   * logs the reason somewhere no client can read — so a plausible equally
   * weighted index appears under a market-cap heading.
   */
  await openPreview(window, 'CAP-NOSHARES')
  // Past the end of the stub's market data, which is the real shape of the
  // fault: a date the frame has no bar for.
  await window.getByLabel('As of').fill('2027-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  await expect(window.locator('.tbl-head')).toContainText('Mkt cap (bn)')
  await expect(window.locator('.tbl-head')).toContainText('FF mkt cap (bn)')
  await expect(window.locator('.preview-warning')).toContainText('Every weight here is identical')

  /*
   * And it names the DATE as the thing to check, not the cap columns.
   * `MarketCapWeighted` reads the exact date with no lookback, while the
   * caps beside it come from a thirty-day one — so full caps and an
   * unweighted index are perfectly consistent, and telling a reader to
   * check the caps sends them somewhere that cannot answer (BU-187).
   */
  await expect(window.locator('.preview-warning')).toContainText('market data ends')
  await expect(window.locator('.preview-warning')).toContainText('no guide')
})

test('an equally weighted index says nothing about market caps', async ({ window }) => {
  // The warning is about a contradiction. An index that asked for equal
  // weights and got them is not one.
  await openPreview(window, 'TECH10')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  await expect(window.locator('.preview-warning')).toHaveCount(0)
  await expect(window.locator('.tbl-head')).not.toContainText('Mkt cap')
})

test('the pre-cap weight is shown only where the cap bound', async ({ window }) => {
  /*
   * BU-192. py-beacon publishes `uncapped_weight` on a name the cap held
   * and null on every other. This column fell back to the FINAL weight, so
   * most rows showed their post-redistribution weight under a heading that
   * said raw — which made redistribution look like it had reached only the
   * capped names, and made the column look unrelated to market cap.
   */
  await openPreview(window, 'TECH10')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  const rows = window.locator('.tbl-body .tbl-row')
  await expect(rows.first()).toBeVisible()

  // Capped names carry a real pre-cap figure, higher than the cap.
  await expect(rows.first()).toContainText('15.00%')

  // An uncapped name has none, and says so rather than repeating its
  // final weight — which is what made redistribution look like it had
  // reached nobody.
  const uncapped = window.locator('.tbl-body .tbl-row', { hasText: 'CMP009' })
  await expect(uncapped).toContainText('—')
  await expect(uncapped).not.toContainText('9.50% —')
})
