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

/** The same choice from the menu bar, where it lives in a flyout (BU-121). */
async function chooseLayoutFromMenu(window: Page, label: string): Promise<void> {
  await window.getByRole('button', { name: 'View', exact: true }).click()
  await window.getByRole('menuitem', { name: /Window layout/ }).hover()
  await window.getByRole('menuitemradio', { name: label }).click()
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

test('two rows stack the panes rather than sitting them side by side', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Two rows')
  await expect(window.locator('.pane')).toHaveCount(2)

  const [top, bottom] = await window.locator('.pane').all()
  const above = await top?.boundingBox()
  const below = await bottom?.boundingBox()
  if (above === undefined || above === null || below === undefined || below === null) {
    throw new Error('both panes should have a box')
  }

  // Stacked: the second starts below the first, and both keep the full width.
  expect(below.y).toBeGreaterThan(above.y + above.height - 1)
  expect(Math.abs(below.width - above.width)).toBeLessThan(2)
  expect(above.width).toBeGreaterThan(below.height)

  // One handle, and it runs across rather than down (BU-117).
  await expect(window.locator('.pane-divider')).toHaveCount(1)
  await expect(window.locator('.pane-divider-y')).toHaveCount(1)
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

test('the main pane can sit on the right, with the stack beside it', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await chooseLayout(window, 'Stack with main pane')
  await expect(window.locator('.pane')).toHaveCount(3)

  const boxes = await Promise.all(
    [0, 1, 2].map(async (pane) => window.locator(`[data-pane="${String(pane)}"]`).boundingBox())
  )
  const [topLeft, bottomLeft, right] = boxes
  if (!topLeft || !bottomLeft || !right) throw new Error('all three panes should have a box')

  // Reading order: the stack is on the left, the tall one on the right.
  expect(bottomLeft.y).toBeGreaterThan(topLeft.y)
  expect(right.x).toBeGreaterThan(topLeft.x + topLeft.width - 1)
  expect(right.height).toBeGreaterThan(topLeft.height * 1.5)
})

test('the View menu reaches the layouts through a flyout, and can reset the page', async ({
  window
}) => {
  await openPage(window, 'Data Explorer')
  await chooseLayoutFromMenu(window, 'Four panes')
  await expect(window.locator('.pane')).toHaveCount(4)

  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Prices', exact: true }).click()
  await expect(window.locator('.tab-bar').first().getByText('Prices')).toBeVisible()

  await window.getByRole('button', { name: 'View', exact: true }).click()
  await window.getByRole('menuitem', { name: /Reset window/ }).click()

  // Both halves: one pane, and nothing left open in it.
  await expect(window.locator('.pane')).toHaveCount(1)
  await expect(window.getByText(/Nothing open here yet/)).toBeVisible()
})

test('the price table takes the height the pane gives it', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openIn(window, 0, 'Prices')
  await window.locator('[data-pane="0"]').getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  const measure = async (): Promise<{ body: number; pane: number }> =>
    window.evaluate(() => {
      const body = document.querySelector('[data-pane="0"] .tbl-body')?.getBoundingClientRect()
      const pane = document.querySelector('[data-pane="0"]')?.getBoundingClientRect()
      return { body: body?.height ?? 0, pane: pane?.height ?? 0 }
    })

  const full = await measure()
  expect(full.body).toBeLessThan(full.pane)

  await chooseLayout(window, 'Two rows')
  const half = await measure()

  // Shrinks with the pane rather than overflowing it, and never below five
  // rows of 28px (BU-127).
  expect(half.body).toBeLessThan(full.body)
  expect(half.body).toBeLessThan(half.pane)
  expect(half.body).toBeGreaterThanOrEqual(140)
})

test('the table fills the width it is given, and the chart the height', async ({ window }) => {
  await openPage(window, 'Data Explorer')
  await openIn(window, 0, 'Prices')
  await window.locator('[data-pane="0"]').getByRole('combobox', { name: 'Subject' }).fill('CMP001')
  await window.keyboard.press('Enter')
  await window.locator('.tbl-row').first().waitFor()

  const table = await window.evaluate(() => {
    const card = document.querySelector('.tbl')?.getBoundingClientRect()
    const body = document.querySelector('.pane-body')?.getBoundingClientRect()
    const head = [...document.querySelectorAll('.tbl-head .tbl-cell')].map((c) =>
      Math.round(c.getBoundingClientRect().width)
    )
    const row = [...document.querySelectorAll('.tbl-row .tbl-cell')]
      .slice(0, head.length)
      .map((c) => Math.round(c.getBoundingClientRect().width))
    return { card: card?.width ?? 0, avail: body?.width ?? 0, head, row }
  })

  // Fills the pane rather than sitting at the sum of its column widths, and
  // the head still lines up with the body at that width (BU-131).
  expect(table.card).toBeGreaterThan(table.avail - 60)
  expect(table.head).toEqual(table.row)
  // Grown in proportion: Date was declared widest of the first five.
  expect(table.head[0] ?? 0).toBeGreaterThan(table.head[1] ?? 0)

  await openIn(window, 0, 'Charting')
  await window.locator('.level-chart').waitFor()
  const tall = await window.evaluate(
    () => document.querySelector('.level-chart')?.getBoundingClientRect().height ?? 0
  )

  await chooseLayout(window, 'Two rows')
  const short = await window.evaluate(
    () => document.querySelector('.level-chart')?.getBoundingClientRect().height ?? 0
  )

  // Takes the pane's height, down to a floor that stays readable (BU-132).
  expect(short).toBeLessThan(tall)
  expect(short).toBeGreaterThanOrEqual(240)
})
