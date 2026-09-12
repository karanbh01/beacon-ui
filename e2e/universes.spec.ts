import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * Creating and editing universes (BU-78, against BN-132).
 *
 * The whole acceptance path: from an empty workspace, build a universe out of
 * synthetic names, select it in an index definition, and watch the preview
 * resolve against it.
 */

test('the seeded universe is read-only, and says why', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  // The tab lands on the overview now (BU-93), so pick one first.
  await window.getByRole('combobox', { name: 'Universe' }).selectOption('GLOBAL')

  await expect(window.getByText(/seeded by the engine/)).toBeVisible()
  // No Edit control at all, rather than one the engine would refuse. Scoped
  // to the view: "Edit" is also a menu-bar menu.
  await expect(window.locator('.universe-view').getByRole('button', { name: 'Edit' })).toHaveCount(
    0
  )
})

test('a universe is created from pasted names and appears in the catalogue', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Tech Ten')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP000, CMP001\nCMP002')
  await window.getByRole('button', { name: 'Add pasted' }).click()

  // The running count is what says whether you built what you meant to.
  await expect(window.getByText('3 members')).toBeVisible()

  await window.getByRole('button', { name: 'Create universe' }).click()

  // Selected, and its members are the ones pasted.
  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('TECH-TEN')
  await expect(window.locator('.tbl-row')).toHaveCount(3)
})

test('the engine’s validation error renders inline, not as a raw failure', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Bad List')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('NOPE001')
  await window.getByRole('button', { name: 'Add pasted' }).click()
  await window.getByRole('button', { name: 'Create universe' }).click()

  await expect(window.getByText(/not in reference data: NOPE001/)).toBeVisible()
})

test('a created universe is selectable in an index definition', async ({ window }) => {
  // The acceptance path, end to end.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('My Sector')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP010 CMP011')
  await window.getByRole('button', { name: 'Add pasted' }).click()
  await window.getByRole('button', { name: 'Create universe' }).click()
  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('MY-SECTOR')

  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  const starting = window.getByRole('combobox', { name: 'Starting universe' })
  await expect(starting).toBeVisible()
  await starting.selectOption('MY-SECTOR')

  await expect(window.getByText('2 eligible assets')).toBeVisible()
})

test('a universe is built by filtering the dataset, and previewed before it is saved', async ({
  window
}) => {
  // BU-85. The controls are generated from the reference columns the engine
  // actually returned, so this also proves the batch was not rejected — an
  // unknown column name is a hard 422 and would leave no filters at all.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Health Names')

  // A row at a time, as the index designer is built (BU-90).
  await window.getByRole('button', { name: /Add filter/ }).click()
  await window.getByLabel('Row 01 dimension').selectOption('sector')
  await window.getByRole('button', { name: 'Row 01 values' }).click()
  await window.getByRole('checkbox', { name: 'Health Care' }).check()
  await window.keyboard.press('Escape')

  const editor = window.locator('.universe-editor')
  // The count the row itself reports, which is what says whether the filter
  // did what you meant before you save it.
  await expect(editor.getByText('40 pass')).toBeVisible()
  await expect(editor.getByText('40 members', { exact: false })).toBeVisible()
  await expect(editor.locator('.tbl-row').first()).toBeVisible()

  await window.getByRole('button', { name: 'Create universe' }).click()

  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('HEALTH-NAMES')
  await expect(window.getByText('40 assets', { exact: false })).toBeVisible()
})

test('a symbol the dataset does not carry is called out as it is added', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP005, NOPE001')
  await window.getByRole('button', { name: 'Add pasted' }).click()

  // Said here rather than after a failed save — the engine refuses the whole
  // list for one bad name.
  await expect(window.getByText(/not in the dataset: NOPE001/)).toBeVisible()
  await expect(window.getByText(/1 added by hand, found in the dataset/)).toBeVisible()
})

test('a universe can be read as it stood on a past date', async ({ window }) => {
  // BU-92. The date goes to the engine, which returns only rows valid then;
  // a name not listed yet must drop out rather than draw as a blank row.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await window.getByRole('combobox', { name: 'Universe' }).selectOption('GLOBAL')

  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()

  await window.getByLabel('As of').fill('2018-01-02')

  // Every fourth synthetic name lists in 2020, so a quarter of them are gone.
  await expect(window.getByText('90 assets', { exact: false })).toBeVisible()
  await expect(window.getByText(/as of 2018-01-02/)).toBeVisible()
  await expect(window.getByText(/30 of the stored 120 were not listed then/)).toBeVisible()
})

test('the tab opens on a list of universes rather than inside one', async ({ window }) => {
  // BU-93. It used to open on `catalogue[0]` — the seeded GLOBAL — so the
  // first thing anyone saw was 120 rows of a universe they had not chosen.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  const overview = window.locator('.universe-overview')
  await expect(overview.getByText('All loaded assets')).toBeVisible()
  // Counted as of the latest date the data reaches, not the stored length.
  await expect(overview.getByText('120', { exact: true })).toBeVisible()
  await expect(overview.getByText('2026-08-03').first()).toBeVisible()
  // Loosely: the stub's catalogue GROWS across this file, which is the point
  // of BU-78's mutable universes, so a fixed total would be order-dependent.
  await expect(window.getByText(/\d+ universes? · /)).toBeVisible()

  await overview.getByText('All loaded assets').click()
  await expect(window.getByText('120 assets', { exact: false })).toBeVisible()
})

test('an index definition can be created, which is what the tab is for', async ({ window }) => {
  // BU-95. The create route had been reachable only through a misread 404,
  // and BU-87 removed the misread along with the route.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')

  await expect(window.locator('.index-overview').getByText('TECH10', { exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'New index…' }).click()

  // Rejected before anything is sent: a space cannot address a document.
  await window.getByRole('textbox', { name: 'Index id' }).fill('my index')
  await expect(window.getByRole('button', { name: 'Create' })).toBeDisabled()

  await window.getByRole('textbox', { name: 'Index id' }).fill('MY-INDEX')
  await window.getByRole('button', { name: 'Create' }).click()

  await expect(window.getByRole('textbox', { name: 'Name' })).toBeVisible()

  // And back out through the picker, since #103 removed the back arrow.
  await window.getByRole('combobox', { name: 'Index' }).selectOption('')
  await expect(window.getByRole('button', { name: 'New index…' })).toBeVisible()
})

test('market cap fills its column and becomes a filter', async ({ window }) => {
  // BU-85's last piece. The engine had no market cap in any form, so the
  // "FF Mkt Cap ($B)" column drawn from the Figma frame showed a dash on
  // every row; it is a derived field now, asked for by name.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')
  await window.getByRole('combobox', { name: 'Universe' }).selectOption('GLOBAL')

  const table = window.locator('.universe-view .tbl-row').first()
  await expect(table).toBeVisible()
  await expect(table.getByText('—', { exact: true })).toHaveCount(0)

  // And the builder derives a range filter from it, with no client change.
  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('button', { name: /Add filter/ }).click()

  // The pool is the whole seeded universe plus its reference rows, so the
  // dimensions appear only once that has arrived.
  const dimensions = window.getByLabel('Row 01 dimension')
  await expect
    .poll(async () => dimensions.locator('option').allTextContents(), { timeout: 20_000 })
    .toContain('Market cap')
  expect(await dimensions.locator('option').allTextContents()).toContain('Free float market cap')
})

test('a universe made here can be deleted, and a seeded one cannot', async ({ app, window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await window.getByRole('button', { name: 'New universe…' }).click()
  await window.getByRole('textbox', { name: 'Universe name' }).fill('Disposable')
  await window.getByRole('textbox', { name: 'Paste identifiers' }).fill('CMP010 CMP011')
  await window.getByRole('button', { name: 'Add pasted' }).click()
  await window.getByRole('button', { name: 'Create universe' }).click()
  await expect(window.getByRole('combobox', { name: 'Universe' })).toHaveValue('DISPOSABLE')

  // Back to the list: the overview is what the tab shows with nothing
  // selected (BU-93).
  await window.getByRole('combobox', { name: 'Universe' }).selectOption('')
  const row = window.locator('.universe-overview .tbl-row', { hasText: 'Disposable' })
  await expect(row).toBeVisible()

  // The seeded one offers nothing to press: the engine refuses it, and a
  // button for something that will be turned down is a lie (BU-144).
  await expect(
    window
      .locator('.universe-overview .tbl-row', { hasText: 'All loaded assets' })
      .getByRole('button')
  ).toHaveCount(0)

  // Answer the platform's own question in main, since that is where it is asked.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false })
  })

  await row.getByRole('button', { name: 'Delete Disposable' }).click()
  await expect(
    window.locator('.universe-overview .tbl-row', { hasText: 'Disposable' })
  ).toHaveCount(0)
})

async function openDraft(window: Page): Promise<void> {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.getByRole('button', { name: 'New index…' }).click()
  await window.getByRole('textbox', { name: 'Index id' }).fill('MY-INDEX')
  await window.getByRole('button', { name: 'Create' }).click()
  await expect(window.getByText('Weighting & caps')).toBeVisible()
}

test('the methodology card is the same width with an editor open', async ({ window }) => {
  // BU-159: `flex: 1 1 auto` sized the card from its content, so opening a
  // rule editor — whose fields are wider than a collapsed row — widened the
  // card and reflowed the row around it.
  await openDraft(window)

  const card = window.locator('.methodology')
  const closed = await card.boundingBox()

  await window.getByText('Sector Information Technology').click()
  await expect(window.getByLabel('Rule type')).toBeVisible()
  const open = await card.boundingBox()

  expect(open?.width).toBe(closed?.width)
  // And wide, not merely consistent: sizing to content gave it 504 of a
  // 1382px pane while the editor's own fields wanted 726 (BU-161).
  expect(closed?.width ?? 0).toBeGreaterThan(700)
})

test('a narrow pane goes to the methodology, not to the validation card', async ({ window }) => {
  await openDraft(window)

  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: 'Two columns' }).click()
  await window.keyboard.press('Escape')

  // The validation card is a fixed 440. Taking that out of a 690px pane left
  // the methodology 234 and its editor unusable, so it wraps underneath
  // instead (BU-161).
  const pane = await window.locator('.pane-body').first().boundingBox()
  const card = await window.locator('.methodology').boundingBox()

  expect(card?.width ?? 0).toBeGreaterThan((pane?.width ?? 0) * 0.85)
})

test('a weighting is chosen, edited and taken away again', async ({ window }) => {
  // BU-160: it used to arrive as EqualWeighted on a row that could not be
  // removed or edited — the app's default, shown as the user's decision.
  await openDraft(window)

  await window.getByRole('button', { name: 'Remove weighting', exact: true }).click()

  // Nothing to send: `scheme` carries min_length 1, so this is a 422 against
  // the request body rather than a finding. The app says so itself.
  await expect(window.getByText(/Choose a weighting scheme/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Validate' })).toBeDisabled()
  await expect(window.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  // The slot offers the weighting itself while there is none.
  await window.getByRole('button', { name: /^\+ Add weighting/ }).click()
  await expect(window.getByRole('button', { name: 'Apply' })).toBeDisabled()

  // The engine's own list (BN-117), and the cap edited where it lives.
  await window.getByLabel('Rule type').selectOption('MarketCapWeighted')
  await window.getByLabel('Max weight').fill('0.15')
  await window.getByRole('button', { name: 'Apply' }).click()

  await expect(window.getByText('Single-constituent cap 15.0%')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()

  // The cap comes off on its own, leaving the scheme it capped.
  await window.getByRole('button', { name: 'Remove cap', exact: true }).click()
  await expect(window.getByText('Single-constituent cap 15.0%')).toHaveCount(0)
  await expect(window.getByText('Market cap weighted')).toBeVisible()
})

test('the treatment is added and removed rather than assumed', async ({ window }) => {
  await openDraft(window)

  await window.getByRole('button', { name: 'Remove treatment', exact: true }).click()
  await expect(window.getByText('Adjust divisor')).toHaveCount(0)

  // py-beacon applies its own when the key is absent, so the group is empty
  // and its slot is live again.
  const slot = window.getByRole('button', { name: /^\+ Add rule/ }).last()
  await expect(slot).toBeEnabled()
  await slot.click()
  await expect(window.getByText('Adjust divisor')).toBeVisible()
})

test('an index can be deleted, with its backtest results named', async ({ app, window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')

  const overview = window.locator('.index-overview')
  await expect(overview.getByText('EU-VALUE').first()).toBeVisible()

  // Every row offers it: no index is seeded, so unlike a universe there is
  // none the engine would refuse (BN-157, BU-151).
  const seen: string[] = []
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { detail?: string }
      ;(globalThis as { asked?: string[] }).asked ??= []
      ;(globalThis as { asked?: string[] }).asked?.push(options.detail ?? '')
      return Promise.resolve({ response: 0, checkboxChecked: false })
    }
  })

  await overview.getByRole('button', { name: 'Delete EU-VALUE' }).click()
  await expect(overview.getByText('EU-VALUE')).toHaveCount(0)
  await expect(overview.getByText('TECH10').first()).toBeVisible()

  // The confirmation said what else goes, because a run somebody waited for
  // disappearing unannounced is the app failing to say what it was doing.
  const asked = await app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? [])
  expect(seen.concat(asked).join(' ')).toContain('backtest results')
})

test('an optimised index shows what it was derived from (BU-170)', async ({ window }) => {
  /*
   * BN-168: a document carries EITHER a pipeline and a universe or a
   * derivation. So this pane has two faces, and the derived one shows the
   * parent, the objective and the constraints — the editable surface IS the
   * derivation, because no parent methodology is embedded to edit.
   */
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')

  const overview = window.locator('.index-overview')
  await overview.getByText('TECH10-OPT', { exact: true }).click()

  await expect(window.getByText('Derived from')).toBeVisible()
  await expect(window.getByRole('button', { name: /TECH10 →/ })).toBeVisible()
  await expect(window.getByText('min_tracking_error')).toBeVisible()

  // The constraints are the same rows a constraint set holds, so the same
  // editor serves both — named fields from the catalogue, not free text.
  await window.getByText('max 5%').click()
  await expect(window.locator('.constraint-editor').getByLabel('max')).toBeVisible()

  // No universe to choose: a derivation has none. Preview IS offered, since
  // py-beacon answers a derivation with the solve (BU-173).
  await expect(window.getByText('UNIVERSE')).toHaveCount(0)
  await expect(window.getByRole('button', { name: /Constituent Preview/ })).toBeVisible()

  // And no invented finding: it needs no weighting, so nothing is missing.
  await expect(window.getByText(/Choose a weighting scheme/)).toHaveCount(0)
})

test('previewing an optimised index shows the solve, not a waterfall (BU-173)', async ({
  window
}) => {
  /*
   * BN-170: a preview answers in one of two faces, and `solve` is the
   * discriminator. A derivation has no rungs to show — the solve moves every
   * weight at once rather than eliminating names in steps — so the analogue
   * is before, after, and what each constraint cost.
   */
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10-OPT', { exact: true }).click()
  await window.getByRole('button', { name: /Constituent Preview/ }).click()

  const preview = window.locator('.constituent-preview-view')
  await expect(preview.getByText('min_tracking_error')).toBeVisible()
  await expect(preview.getByText('9 constituents')).toBeVisible()
  // Distance from the parent's published weights, which is what a solve is
  // measured by — not turnover between two dates.
  await expect(preview.getByText('9.00%')).toBeVisible()

  // Every constraint, not only the binding ones: a list of binding rows is a
  // list of zeros, and the informative figure is the room the others had.
  const bound = preview.locator('.solve-constraint', { hasText: 'maximum weight' })
  await expect(bound.locator('.solve-constraint-room')).toHaveText('bound')
  const names = preview.locator('.solve-constraint', { hasText: 'at most 12 names' })
  await expect(names.locator('.solve-constraint-room')).toHaveText('3 names')
  const budget = preview.locator('.solve-constraint', { hasText: 'one-way turnover' })
  await expect(budget.locator('.solve-constraint-room')).toHaveText('11.00%')

  // Before/after/delta in place of the rule columns, biggest move first —
  // and the name the solve dropped moves furthest, which is right.
  await expect(preview.getByText('01 · FilterRule')).toHaveCount(0)
  await expect(preview.getByText('Parent w')).toBeVisible()
  await expect(preview.locator('.tbl-body .tbl-row').first()).toContainText('CMP009')
  await expect(preview.locator('.solve-delta-down').first()).toHaveText('-5.00%')

  // The date it reports is the parent's rebalance, not the day asked for: a
  // derivation solves only where its parent rebalances.
  await expect(preview.getByText(/solved from TECH10 at its 2025-06-20 rebalance/)).toBeVisible()
})

test('previewing a rule-driven index still shows the waterfall (BU-173)', async ({ window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()
  await window.getByRole('button', { name: /Constituent Preview/ }).click()

  const preview = window.locator('.constituent-preview-view')
  await expect(preview.getByText('01 · FilterRule')).toBeVisible()
  await expect(preview.getByText('Parent w')).toHaveCount(0)
  await expect(preview.getByText(/names evaluated/)).toBeVisible()
})

test('deleting a parent says which optimised indices go with it', async ({ app, window }) => {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')

  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { detail?: string }
      ;(globalThis as { warned?: string[] }).warned ??= []
      ;(globalThis as { warned?: string[] }).warned?.push(options.detail ?? '')
      return Promise.resolve({ response: 0, checkboxChecked: false })
    }
  })

  const overview = window.locator('.index-overview')
  await overview.getByRole('button', { name: 'Delete TECH10', exact: true }).click()

  // Warned from the catalogue, before the request.
  const warned = await app.evaluate(() => (globalThis as { warned?: string[] }).warned ?? [])
  expect(warned.join(' ')).toContain('TECH10-OPT')

  // Reported from the response, which is the only thing that knows what the
  // engine actually removed (BN-168).
  await expect(window.getByText(/Deleted 2 indices/)).toBeVisible()
  await expect(overview.getByText('TECH10-OPT')).toHaveCount(0)
})

test('a listing that left a universe out says so (BU-185)', async ({ engine, window }) => {
  /*
   * BN-174. py-beacon's listings skip a document they cannot read and
   * report the count, because a list short by one is otherwise identical
   * to a complete one — the blank-picker lie of BU-181, moved one level
   * out and now visible.
   */
  engine.skipUniverses(2)

  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await expect(window.locator('.universe-skipped')).toContainText(
    '2 could not be read and are missing from this list'
  )
  // And the picker still works: the universes that DID arrive are choices.
  await expect(window.getByRole('combobox', { name: 'Universe' })).toBeEnabled()
})

test('a complete listing says nothing at all (BU-185)', async ({ window }) => {
  // Silence is the common case; "0 could not be read" trains a reader to
  // stop looking at the line.
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Universe Set')

  await expect(window.locator('.universe-skipped')).toHaveCount(0)
})
