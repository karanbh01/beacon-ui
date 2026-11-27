import type { Page } from '@playwright/test'
import { expect, openPage, openView, test } from './fixtures'

/**
 * Drilldown on a name's profile (py-beacon 0.11.0): the top every face
 * shares, and Summary's return and risk by period (Karan, 2026-11-27). The
 * stub's profile is in stubProfile.ts.
 */

async function drill(window: Page, strategyId: string, identifier: string): Promise<Page> {
  await openPage(window, 'Beacon View')
  await openView(window, 'Overview')
  await window
    .locator('.index-overview-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(strategyId)
  await window.keyboard.press('Enter')
  await openView(window, 'Drilldown')
  await window
    .locator('.drilldown-view')
    .getByRole('combobox', { name: 'Subject' })
    .fill(identifier)
  await window.keyboard.press('Enter')
  await expect(window.locator('.drilldown-head')).toBeVisible()
  return window
}

test('the top says what the name is and how the fund holds it', async ({ window }) => {
  await drill(window, 'TECH10', 'AAPL')
  const head = window.locator('.drilldown-head')

  await expect(head.locator('.drilldown-name-value')).toHaveText('AAPL Inc.')
  // Dates as Karan reads them: 25 Nov 2025, not 2025-11-25.
  await expect(head.locator('.drilldown-name-meta')).toHaveText(
    /key data at \d{1,2} [A-Z][a-z]{2} \d{4}$/
  )
  await expect(head.getByText('Held since')).toBeVisible()
  await expect(head.getByText('Rebalances held')).toBeVisible()
  await expect(head.locator('.drilldown-name-style .active-token')).toHaveText(/^(OW|UW)$/)

  for (const title of ['Weight', 'Active weight', 'Style']) {
    await expect(head.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  // The index and a benchmark other than it are lines over the fund's curve.
  await expect(head.locator('.weight-histogram-legend')).toHaveText(/Fund.*Index.*Benchmark/)
  await expect(head.locator('.active-weights-strip svg')).toBeVisible()

  // The weights at the five latest rebalances, then OW or UW under each.
  const weights = head.locator('.drilldown-rebalances')
  await expect(weights.locator('[role="row"]').filter({ hasText: 'Fund weight' })).toBeVisible()
  await expect(weights.locator('[role="row"]').filter({ hasText: 'Active weight' })).toBeVisible()
  await expect(weights.locator('.active-token')).toHaveCount(5)
})

test('a benchmark that is the index is one column and one line', async ({ window }) => {
  await drill(window, 'US-QUALITY', 'CMP000')
  const view = window.locator('.drilldown-view')

  await expect(view.locator('.weight-histogram-legend')).toHaveText(/Index\/benchmark/)
  await expect(view.locator('.drilldown-rebalances')).toContainText('Index/BM weight')
  await expect(view.getByRole('columnheader', { name: 'vs. Index/BM' }).first()).toBeVisible()
  await expect(view.getByRole('columnheader', { name: 'vs. BM', exact: true })).toHaveCount(0)
})

test('Summary pages return and risk by period', async ({ window }) => {
  await drill(window, 'TECH10', 'AAPL')
  const view = window.locator('.drilldown-view')

  await expect(view.getByText('All periods', { exact: true })).toBeVisible()
  for (const name of ['AAPL', 'vs. Fund', 'vs. Index', 'vs. BM']) {
    await expect(view.getByRole('columnheader', { name, exact: true }).first()).toBeVisible()
  }
  await expect(view.getByText('Share of volatility')).toBeVisible()
  await expect(view.getByText('Tracking error')).toHaveCount(0)

  // Opens on the newest periods; Earlier steps back.
  const later = view.getByRole('button', { name: 'Later' })
  await expect(later).toBeDisabled()
  await view.getByRole('button', { name: 'Earlier' }).click()
  await expect(later).toBeEnabled()

  await view.getByRole('radio', { name: 'Monthly' }).click()
  await expect(view.getByText('Dec 2025', { exact: true }).first()).toBeVisible()
  await view.getByRole('radio', { name: 'Annual' }).click()
  await expect(view.getByText('2025', { exact: true }).first()).toBeVisible()
})

test('the backtest beside the name can be changed', async ({ window }) => {
  await drill(window, 'TECH10', 'AAPL')
  const backtest = window.locator('.drilldown-view').getByRole('combobox', { name: 'Backtest' })

  await expect(window.locator('.drilldown-view .field-label')).toHaveText(['Security', 'Backtest'])
  await expect(backtest).toHaveValue('TECH10')
  await backtest.fill('US-QUALITY')
  await window.keyboard.press('Enter')
  // US-QUALITY's benchmark is its index: one Index/BM column.
  await expect(window.locator('.drilldown-rebalances')).toContainText('Index/BM weight')
})

test('Selection opens a rebalance onto the rules it was tested against', async ({ window }) => {
  await drill(window, 'TECH10', 'AAPL')
  const view = window.locator('.drilldown-view')
  await view.getByRole('radio', { name: 'Selection' }).click()
  const face = view.locator('.drilldown-face')

  for (const name of [
    'Fund weight',
    'Index weight',
    'Benchmark weight',
    'Active weight',
    'OW/UW'
  ]) {
    await expect(face.getByRole('columnheader', { name, exact: true })).toBeVisible()
  }
  // Corporate actions have a face of their own (Karan, 2026-11-27).
  await expect(face.getByRole('heading', { name: 'Corporate actions' })).toHaveCount(0)

  await face.locator('.tbl-body [role="row"]').first().click()
  const tests = face.locator('.drilldown-rule-tests')
  for (const name of ['Rule', 'Threshold', 'Actual', 'Difference', 'Relative']) {
    await expect(tests.getByRole('columnheader', { name, exact: true })).toBeVisible()
  }
  await expect(tests).toContainText('Market cap rule')

  // The chart beside it: one rule's value at each rebalance, named by its field.
  const chart = face.locator('.drilldown-rule-chart')
  await expect(chart.locator('.stacked-bars-legend')).toHaveText(
    /Market cap.*Within 10%.*Threshold/
  )
  await chart.getByRole('combobox', { name: 'Rule' }).click()
  await window.getByRole('option', { name: 'Avg daily volume rule' }).click()
  await expect(chart.locator('.stacked-bars-legend')).toContainText('Avg daily volume')
})

test('corporate actions are a face of their own', async ({ window }) => {
  await drill(window, 'TECH10', 'AAPL')
  const view = window.locator('.drilldown-view')
  await view.getByRole('radio', { name: 'Corporate actions' }).click()

  await expect(view.getByRole('heading', { name: 'Corporate actions' })).toBeVisible()
  await expect(view.getByRole('columnheader', { name: 'Ex-date' })).toBeVisible()

  await view.getByRole('radio', { name: 'Trading' }).click()
  await expect(view.getByRole('heading', { name: 'Trades' })).toBeVisible()
  await expect(view.getByRole('heading', { name: 'Corporate actions' })).toHaveCount(0)
})
