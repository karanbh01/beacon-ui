import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * Screening an index on reference data (BU-182).
 *
 * py-beacon has always been able to do this — `ExpressionRule` resolves
 * `data.reference.sector` at each rebalance — but the tree had no schema,
 * so no client could write one. BN-188 published the grammar and
 * `ParameterSpec.ref`, and this is the editor that grammar allows.
 */
async function openScreen(window: Page): Promise<void> {
  await openPage(window, 'Strategy Builder')
  await openView(window, 'Index Definition')
  await window.locator('.index-overview').getByText('TECH10', { exact: true }).click()

  // A universe whose names carry reference rows, so values can be offered.
  await window.getByLabel('Starting universe').selectOption('GLOBAL')

  await window
    .getByRole('button', { name: /Add rule/ })
    .first()
    .click()
  await window
    .locator('.methodology-row', { hasText: 'FilterRule' })
    .last()
    .locator('.methodology-main')
    .click()
  /*
   * Wait for the CATALOGUE, not just the control.
   *
   * With no rule types loaded the editor degrades to a free-text type, so
   * `selectOption` would be racing the request rather than the render —
   * which is the shape of the one failure seen in a full suite run and
   * never reproduced in isolation.
   */
  const type = window.getByLabel('Rule type')
  await expect(type.locator('option[value="ExpressionRule"]')).toHaveCount(1)
  await type.selectOption('ExpressionRule')
}

test('a structured parameter renders from its schema, not from its name', async ({ window }) => {
  await openScreen(window)

  /*
   * The catalogue says `expression` conforms to `ExpressionNode`, and the
   * editor renders rows off that. Keying on the parameter being CALLED
   * "expression" would work here and leave the catalogue undescriptive at
   * exactly the rule that needs it most.
   */
  await expect(window.locator('.expression-editor')).toBeVisible()
  await expect(window.getByRole('button', { name: /Add clause/ })).toBeVisible()
  // `on_missing` is a real choice, and excluded-by-default is the engine's.
  await expect(window.getByLabel('Names without a value')).toHaveValue('exclude')
})

test('the fields are the ones the engine publishes', async ({ window }) => {
  await openScreen(window)
  await window.getByRole('button', { name: /Add clause/ }).click()

  // `/data/fields` spells a stored column lowercased — SECTOR becomes
  // `reference.sector` — and guessing that here is how a screen names a
  // datapoint the engine has never heard of.
  const field = window.getByLabel('Field')
  await expect(field.locator('option[value="reference.sector"]')).toHaveCount(1)
  await expect(field.locator('option[value="reference.country_domicile"]')).toHaveCount(1)
  // Reference only for now: a market field has no closed set of values.
  await expect(field.locator('option[value="market.close"]')).toHaveCount(0)
})

test('the values are the ones the universe actually holds', async ({ window }) => {
  await openScreen(window)
  await window.getByRole('button', { name: /Add clause/ }).click()
  await window.getByLabel('Field').selectOption('reference.sector')
  await window.getByLabel('Comparison').selectOption('in')

  // A closed set, from the universe's own reference rows rather than a list
  // maintained here — so it is right whenever the data is.
  await window.getByRole('button', { name: 'Value' }).click()
  await expect(window.getByRole('checkbox', { name: 'Information Technology' })).toBeVisible()
  await expect(window.getByRole('checkbox', { name: 'Financials' })).toBeVisible()
})

test('a screen says what it screens for, and comes back the same', async ({ window }) => {
  await openScreen(window)
  await window.getByRole('button', { name: /Add clause/ }).click()
  await window.getByLabel('Field').selectOption('reference.sector')
  await window.getByLabel('Comparison').selectOption('in')

  await window.getByRole('button', { name: 'Value' }).click()
  await window.getByRole('checkbox', { name: 'Financials' }).check()
  await window.keyboard.press('Escape')
  await window.getByRole('button', { name: 'Apply' }).click()

  /*
   * In words, not as a serialised tree. This is the one rule whose params
   * are a structure, and a row reading `{"node":"all",...}` tells a reader
   * nothing about what their index selects.
   */
  const row = window.locator('.methodology-row', { hasText: 'is one of' })
  await expect(row).toContainText('reference.sector is one of Financials')

  // Reopened, the clause is the one that was written — not a blank editor,
  // which would discard the screen on the next Apply.
  await row.locator('.methodology-main').click()
  await expect(window.getByLabel('Field')).toHaveValue('reference.sector')
  await expect(window.getByLabel('Comparison')).toHaveValue('in')
})

test('two clauses join, and the join is a choice', async ({ window }) => {
  await openScreen(window)

  await window.getByRole('button', { name: /Add clause/ }).click()
  await window.getByLabel('Field').selectOption('reference.sector')

  // One clause needs no combinator: it is not joining anything.
  await expect(window.getByRole('radio', { name: 'Match all' })).toHaveCount(0)

  await window.getByRole('button', { name: /Add clause/ }).click()
  await expect(window.getByRole('radio', { name: 'Match all' })).toBeChecked()

  await window.getByRole('radio', { name: 'Match any' }).click()
  await window.getByRole('button', { name: 'Apply' }).click()

  // Scoped to the rule: " or " also appears in "Order desc" two rows up.
  await expect(window.locator('.methodology-row', { hasText: 'ExpressionRule' })).toContainText(
    ' or '
  )
})
