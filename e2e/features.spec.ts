import { expect, openPage, openView, test } from './fixtures'

/**
 * Data Explorer → Features (BU-99, reshaped by BU-113).
 *
 * A dated series rather than a snapshot: the point-in-time cards went once
 * the whole history became reachable, since the newest rows say the same
 * thing without a second shape to read.
 */

async function open(window: import('@playwright/test').Page, identifier: string): Promise<void> {
  await openPage(window, 'Data Explorer')
  await openView(window, 'Features')
  await window.getByRole('combobox', { name: 'Subject' }).fill(identifier)
  await window.keyboard.press('Enter')
}

test('shows values over time, newest first', async ({ window }) => {
  await open(window, 'CMP001')

  await expect(window.getByRole('columnheader', { name: 'Date' })).toBeVisible()
  const dates = await window.getByRole('cell', { name: /^2026-/ }).allTextContents()
  expect(dates[0]).toBe('2026-07-31')
  expect(dates).toContain('2026-04-30')

  // Provenance travels with each value, which is most of why it is readable.
  await expect(window.getByRole('cell', { name: 'reported 2026Q2' })).toBeVisible()
})

test('carries no point-in-time cards any more', async ({ window }) => {
  await open(window, 'CMP001')
  await expect(window.getByRole('columnheader', { name: 'Date' })).toBeVisible()

  await expect(window.getByRole('heading', { name: 'Fundamentals' })).toHaveCount(0)
  await expect(window.getByRole('heading', { name: 'History' })).toHaveCount(0)
})

test('narrows to a date range, and a typed date beats the buttons', async ({ window }) => {
  await open(window, 'CMP001')
  await expect(window.getByText(/4 values/)).toBeVisible()

  await window.getByRole('textbox', { name: 'From' }).fill('2026-06-01')
  await expect(window.getByText(/2 values of 4 held/)).toBeVisible()

  await window.getByRole('textbox', { name: 'To' }).fill('2026-06-30')
  await expect(window.getByText('No values in this range.')).toBeVisible()
})

test('filters to one field', async ({ window }) => {
  await open(window, 'CMP001')
  await expect(window.getByText(/4 values/)).toBeVisible()

  await window.getByLabel('Field').selectOption('eps')
  await expect(window.getByText(/2 values of 4 held/)).toBeVisible()
  await expect(window.getByRole('cell', { name: 'Pe ratio' })).toHaveCount(0)
})
