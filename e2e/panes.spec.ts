import { expect, openPage, test } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Multi-pane layout and drag-and-drop (BU-55), against the real app.
 *
 * The unit tests supply a `DataTransfer` because jsdom has no drag
 * implementation. This is the one that proves a person can actually do it:
 * Chromium's own drag machinery, driven by a pointer.
 */

async function chooseLayout(window: Page, label: string): Promise<void> {
  await window.getByRole('button', { name: 'Layout' }).click()
  await window.getByRole('radio', { name: label }).click()
  await window.keyboard.press('Escape')
}

/** Open a view from a specific pane's `+`. */
async function openIn(window: Page, pane: number, title: string): Promise<void> {
  await window
    .locator(`[data-pane="${String(pane)}"]`)
    .getByRole('button', { name: 'New tab' })
    .click()
  await window.getByRole('menuitem', { name: title, exact: true }).click()
}

/**
 * The whole bar, not `.tab-bar-strip`: an empty strip collapses to zero width
 * and cannot be dropped on. The bar spans the pane and carries the handlers,
 * so it is both the real target and a visible one.
 */
function strip(window: Page, pane: number) {
  return window.locator(`[data-pane="${String(pane)}"] .tab-bar`)
}

test('a layout choice splits the page into that many panes', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await expect(window.locator('.pane')).toHaveCount(1)

  await chooseLayout(window, 'Two columns')
  await expect(window.locator('.pane')).toHaveCount(2)

  await chooseLayout(window, 'Four panes')
  await expect(window.locator('.pane')).toHaveCount(4)
})

test('each pane holds its own tabs and its own active view', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')

  await openIn(window, 0, 'Prices')
  await openIn(window, 1, 'Reference Data')

  await expect(strip(window, 0).getByText('Prices')).toBeVisible()
  await expect(strip(window, 1).getByText('Reference Data')).toBeVisible()
  await expect(strip(window, 1).getByText('Prices')).toHaveCount(0)

  // Both panes are live at once, which is the whole point of a split.
  await expect(window.locator('[data-pane="0"] .prices-view')).toBeVisible()
  await expect(window.locator('[data-pane="1"] .reference-view')).toBeVisible()
})

test('a tab drags from one pane to another', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await openIn(window, 0, 'Prices')
  await openIn(window, 0, 'Reference Data')

  await strip(window, 0).locator('.tab', { hasText: 'Reference Data' }).dragTo(strip(window, 1))

  await expect(strip(window, 1).getByText('Reference Data')).toBeVisible()
  await expect(strip(window, 0).getByText('Reference Data')).toHaveCount(0)
  await expect(window.locator('[data-pane="1"] .reference-view')).toBeVisible()
})

test('a link survives being dragged away from its source', async ({ window }) => {
  // Taxonomy §1: a linked tab follows another tab BY ID. Moving it to the
  // other side of a split is exactly the arrangement links exist for, and
  // "it still works when it looks like it should not" is what quietly
  // regresses.
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')

  await openIn(window, 0, 'Prices')
  await window.locator('[data-pane="0"]').getByRole('textbox').first().fill('CMP000')
  await window.keyboard.press('Enter')
  await openIn(window, 0, 'Charting')

  await strip(window, 0).locator('.tab', { hasText: 'Charting' }).dragTo(strip(window, 1))

  // The chip still carries the chain, and still resolves the source subject.
  const chip = window.locator('[data-pane="1"] .tab-chip-query')
  await expect(chip).toContainText('CMP000')
  await expect(window.locator('[data-pane="1"] .tab-chip-chain')).toBeVisible()
})

test('collapsing folds the panes together and splitting puts them back', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await openIn(window, 0, 'Prices')
  await openIn(window, 1, 'Reference Data')

  await chooseLayout(window, 'Single pane')
  await expect(window.locator('.pane')).toHaveCount(1)
  // Nothing is lost — both are in the one strip.
  await expect(strip(window, 0).locator('.tab')).toHaveCount(2)

  await chooseLayout(window, 'Two columns')
  await expect(strip(window, 0).locator('.tab')).toHaveCount(1)
  await expect(strip(window, 1).getByText('Reference Data')).toBeVisible()
})

test('a pane that loses its last tab stays, showing the empty state', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await openIn(window, 1, 'Prices')

  await window.locator('[data-pane="1"]').getByRole('button', { name: 'Close Prices' }).click()

  await expect(window.locator('.pane')).toHaveCount(2)
  await expect(window.locator('[data-pane="1"]').getByText(/Nothing open here yet/)).toBeVisible()
})
