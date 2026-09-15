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

  await expect(window.locator('.tbl-head')).toContainText('Market Cap (bn Index Ccy)')
  await expect(window.locator('.tbl-head')).toContainText('FF Market Cap (bn Index Ccy)')
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
  await expect(window.locator('.tbl-head')).not.toContainText('Market Cap')
})

test('the pre-cap weight has no column of its own', async ({ window }) => {
  /*
   * BU-197. BU-192 corrected this column to read `uncapped_weight`, which
   * py-beacon publishes only on a name the cap actually held — so the
   * honest version was a column of dashes with a handful of figures in it.
   * What it said is in the summary line, where it costs no width.
   */
  await openPreview(window, 'TECH10')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  await expect(window.locator('.tbl-body .tbl-row').first()).toBeVisible()
  await expect(window.locator('.tbl-head')).not.toContainText('Pre-cap')
  await expect(window.locator('.preview-footnote')).not.toContainText('pre-cap weight')
})

test('caps come in the index currency, with the local figure beside them', async ({ window }) => {
  /*
   * BU-195, BN-189. A cap used to arrive converted into a hard-coded USD
   * while the weighting converted into the index's own currency, so a EUR
   * index showed dollar caps beside euro weights — the column that exists
   * to explain a weight could not be held against one.
   *
   * The header has to NAME the currency. Two indices in different
   * currencies otherwise render the same column with different contents
   * and nothing on screen says which.
   */
  await openPreview(window, 'CAP-NOSHARES')
  await window.getByLabel('As of').fill('2027-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  // Local first, converted second, each pair followed by its unit (BU-197).
  //
  // The wait is load-bearing: `allInnerTexts` reads once and does not retry,
  // and the table now holds until the caps are in, so reading straight away
  // reads an empty list and reports it as a header mismatch.
  await expect(window.locator('.tbl-body .tbl-row').first()).toBeVisible()
  const headers = await window.locator('.tbl-head .tbl-cell').allInnerTexts()
  const caps = headers.filter((header) => /Market Cap|Ccy/.test(header))
  expect(caps).toEqual([
    'Market Cap (bn Local Ccy)',
    'FF Market Cap (bn Local Ccy)',
    'Local Ccy',
    'Market Cap (bn Index Ccy)',
    'FF Market Cap (bn Index Ccy)',
    'Index Ccy'
  ])

  // The index currency, stated rather than left to be inferred from a header.
  const row = window.locator('.tbl-row').first()
  await expect(row).toContainText('USD')
})

test('a cap with no rate is a missing rate, not a missing cap', async ({ window }) => {
  /*
   * The engine nulls the converted half only and leaves the local half
   * standing, because the local figure is knowable whatever the FX
   * situation. A dash in the converted column would report that as an
   * absence and send a reader after share counts the row already has.
   */
  await openPreview(window, 'CAP-NOSHARES')
  await window.getByLabel('As of').fill('2027-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  // CMP007 is the stub's one rateless name: a currency with no pair.
  const row = window.locator('.tbl-row', { hasText: 'CMP007' }).first()
  await expect(row).toContainText('CHF')
  // Both converted halves, because one missing rate defeats both of them —
  // and both local halves still carry a number, which is the proof.
  await expect(row.locator('.cap-norate')).toHaveCount(2)
  await expect(row.locator('.cap-norate').first()).toHaveText('no rate')
})

test('the table waits for the caps rather than filling in as they land', async ({ window }) => {
  /*
   * BU-197. The caps come from a separate request — several of them above a
   * thousand names, since that is where the engine caps a batch — and the
   * table used to draw the moment the weights landed. Because the rows are
   * sorted by weight and the chunks are cut alphabetically, each answer
   * filled a scattered subset of the table: what Karan saw as the caps
   * loading name by name.
   */
  let release = (): void => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await window.route(/\/data\/reference\?/, async (route) => {
    await held
    await route.continue()
  })

  await openPreview(window, 'CAP-NOSHARES')
  await window.getByLabel('As of').fill('2027-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  // The resolve has answered and the table is still not drawn: a cap column
  // full of dashes is a table that is wrong the first time it is read.
  await expect(window.locator('.view-state')).toContainText('Resolving CAP-NOSHARES')
  await expect(window.locator('.tbl-body')).toHaveCount(0)
  // Nor the summary, so the pane moves from working to done in one step.
  await expect(window.locator('.summary-line')).toHaveCount(0)

  release()
  await expect(window.locator('.tbl-body .tbl-row').first()).toBeVisible()
  await expect(window.locator('.tbl-head')).toContainText('Market Cap (bn Local Ccy)')
})

test('a weighting that cannot convert refuses, and the pane says so', async ({ window }) => {
  /*
   * py-beacon #204 (BN-188/BN-191). A missing FX pair used to drop the
   * constituent and publish a level over the rest: a 50% overnight loss
   * with no market move, flat forever after, the dropped name still listed
   * at 0.0. An index that cannot value a constituent now refuses.
   *
   * A preview reaches the WEIGHTING's guard — selection and weighting is
   * all a preview does — so this is the half of the refusal that lands
   * here rather than on a job.
   */
  await openPreview(window, 'FX-NOCAP')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  // py-beacon's own words, and specific enough to act on: which pair, which
  // name, and the two things it refuses to do instead.
  await expect(window.locator('.view-state')).toContainText('no JPY/USD rate')
  await expect(window.locator('.view-state')).toContainText('Load the pair')

  // And no table behind it. A refusal is not an empty result, and a
  // constituent list drawn beside one is a list nobody should trust.
  await expect(window.locator('.tbl-body')).toHaveCount(0)
})

test('a weighting that crashes is a fault, not a decision', async ({ window }) => {
  /*
   * BN-194 / py-beacon #207. `calculator.py` wraps the weighting call in a
   * bare `except Exception`, so a scheme dividing by zero reaches a client
   * inside the envelope. It shared a code with every deliberate refusal
   * until the split, which meant this pane headed a bug as a decision
   * somebody made — a reader goes looking for what to change, and there is
   * nothing to find.
   */
  await openPreview(window, 'WEIGHT-CRASH')
  await window.getByLabel('As of').fill('2025-06-30')
  await window.getByRole('button', { name: 'Run preview' }).click()

  await expect(window.locator('.view-state')).toContainText('The engine broke on this calculation.')
  await expect(window.locator('.view-state')).not.toContainText('refused to answer')

  // `original_type` tells a ZeroDivisionError from a KeyError without a
  // server log, which is the difference between two bug reports.
  await expect(window.locator('.view-state')).toContainText('Raised a ZeroDivisionError')

  /*
   * The calculation name is the same one a refusal carries. Branching on
   * that `WeightingScheme-` prefix was the tempting shortcut before the
   * split; this is the fixture that would catch anyone reaching for it.
   */
  await expect(window.locator('.view-state')).toContainText('WeightingScheme-EqualWeighted')
})
