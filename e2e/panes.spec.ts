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

test('a tab drops onto the body of a pane, not just its strip', async ({ window }) => {
  // BU-70: the strip is 16px tall at the top of the pane. Ending a drag over
  // the view used to snap the tab back, which reads as a failed drag rather
  // than a missed target.
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await openIn(window, 0, 'Prices')
  await openIn(window, 0, 'Reference Data')

  await strip(window, 0)
    .locator('.tab', { hasText: 'Reference Data' })
    .dragTo(window.locator('[data-pane="1"] .pane-body'))

  await expect(strip(window, 1).getByText('Reference Data')).toBeVisible()
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
  await window.locator('[data-pane="0"]').getByRole('combobox', { name: 'Subject' }).fill('CMP000')
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

test('the divider resizes both panes, and the size sticks', async ({ window }) => {
  await window.setViewportSize({ width: 1440, height: 900 })
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')

  const left = window.locator('[data-pane="0"]')
  const before = (await left.boundingBox())?.width ?? 0

  // Real pointer, because pointer capture is the whole mechanism: without it
  // the drag dies as soon as the cursor leaves the 9px handle.
  const handle = window.getByRole('separator', { name: 'Resize columns' })
  const box = await handle.boundingBox()
  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await window.mouse.down()
  await window.mouse.move(1000, 500, { steps: 12 })
  await window.mouse.up()

  const after = (await left.boundingBox())?.width ?? 0
  expect(after).toBeGreaterThan(before + 100)
  await expect(handle).toHaveAttribute('aria-valuenow', /^(6|7)\d$/)

  // Double-click puts it back.
  await handle.dblclick()
  expect((await left.boundingBox())?.width ?? 0).toBeCloseTo(before, 0)
})

test('a divider will not squeeze a pane out of existence', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')

  const handle = window.getByRole('separator', { name: 'Resize columns' })
  const box = await handle.boundingBox()
  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await window.mouse.down()
  await window.mouse.move(-500, 500, { steps: 8 })
  await window.mouse.up()

  // A pane dragged to nothing is a pane you cannot get back.
  expect((await window.locator('[data-pane="0"]').boundingBox())?.width ?? 0).toBeGreaterThan(80)
})

test('the two dividers in a grid do not steal from each other', async ({ window }) => {
  // They cross, and both handles are centred on the crossing. Left to DOM
  // order the row handle covered the middle of the column handle, so grabbing
  // the most obvious spot on it resized the wrong axis.
  await window.setViewportSize({ width: 1440, height: 900 })
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Four panes')

  const topLeft = window.locator('[data-pane="0"]')
  const before = await topLeft.boundingBox()

  const columns = window.getByRole('separator', { name: 'Resize columns' })
  const box = await columns.boundingBox()
  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await window.mouse.down()
  await window.mouse.move(1000, box!.y + box!.height / 2, { steps: 10 })
  await window.mouse.up()

  const after = await topLeft.boundingBox()
  expect(after!.width).toBeGreaterThan(before!.width + 100)
  // The row split must not have moved.
  expect(after!.height).toBeCloseTo(before!.height, 0)
})

test('only the layouts that are split get a divider', async ({ window }) => {
  await openPage(window, 'Data Explorer')

  await chooseLayout(window, 'Single pane')
  await expect(window.locator('.pane-divider')).toHaveCount(0)

  await chooseLayout(window, 'Two columns')
  await expect(window.locator('.pane-divider')).toHaveCount(1)

  await chooseLayout(window, 'Four panes')
  await expect(window.locator('.pane-divider')).toHaveCount(2)
})

test('each page keeps its own layout and its own splits', async ({ window }) => {
  // BU-75. One global layout meant choosing two columns anywhere chose it
  // everywhere; the page is the smallest unit that can own an arrangement.
  await window.setViewportSize({ width: 1440, height: 900 })

  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await expect(window.locator('.pane')).toHaveCount(2)

  await openPage(window, 'Beacon View')
  await expect(window.locator('.pane')).toHaveCount(1)

  await chooseLayout(window, 'Four panes')
  await expect(window.locator('.pane')).toHaveCount(4)

  // Back to the first page: still two columns, untouched by the second.
  await openPage(window, 'Data Explorer')
  await expect(window.locator('.pane')).toHaveCount(2)
})

test('a divider dragged on one page does not move the other', async ({ window }) => {
  await window.setViewportSize({ width: 1440, height: 900 })

  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')

  const handle = window.getByRole('separator', { name: 'Resize columns' })
  const box = await handle.boundingBox()
  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await window.mouse.down()
  await window.mouse.move(1000, 500, { steps: 10 })
  await window.mouse.up()

  const dragged = (await window.locator('[data-pane="0"]').boundingBox())?.width ?? 0

  await openPage(window, 'Beacon View')
  await chooseLayout(window, 'Two columns')

  // Same layout, different page — an even split, not Data Explorer's.
  const fresh = (await window.locator('[data-pane="0"]').boundingBox())?.width ?? 0
  expect(fresh).toBeLessThan(dragged - 100)

  await openPage(window, 'Data Explorer')
  expect((await window.locator('[data-pane="0"]').boundingBox())?.width ?? 0).toBeCloseTo(
    dragged,
    0
  )
})

test('a pane that loses its last tab stays, showing the empty state', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two columns')
  await openIn(window, 1, 'Prices')

  await window.locator('[data-pane="1"]').getByRole('button', { name: 'Close Prices' }).click()

  await expect(window.locator('.pane')).toHaveCount(2)
  await expect(window.locator('[data-pane="1"]').getByText(/Nothing open here yet/)).toBeVisible()
})
