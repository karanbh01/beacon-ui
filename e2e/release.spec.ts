import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * What 0.1.0 ships, and what it leaves out (BU-209).
 *
 * Karan's list: the AI assistant and the Optimiser, Derivatives and Reports
 * pages are unfinished, so a release build leaves them out — hidden, not
 * disabled — and `pnpm dev` keeps them, where they are being built. Both
 * sides are checked, since a flag only ever tested one way is a flag that
 * works one way. The release side runs unpackaged with BEACON_RELEASE_BUILD,
 * which main reads the way it reads `app.isPackaged`.
 */

const WITHHELD = ['Optimiser', 'Derivatives', 'Reports']
const SHIPPED = ['Data Explorer', 'Strategy Builder', 'Beacon View']

async function searchResults(window: Page, query: string): Promise<string[]> {
  await window.getByRole('combobox', { name: 'Search' }).fill(query)
  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(results).toBeVisible()
  return results.getByRole('option').allTextContents()
}

test.describe('a release build', () => {
  test.use({ releaseBuild: true })

  test('ships the loop, and nothing that stops half-way', async ({ window }) => {
    for (const page of SHIPPED) {
      await expect(window.getByRole('button', { name: page, exact: true })).toBeVisible()
    }
    for (const page of WITHHELD) {
      await expect(window.getByRole('button', { name: page, exact: true })).toHaveCount(0)
    }
    await expect(window.getByRole('button', { name: 'AI assistant' })).toHaveCount(0)
  })

  test('offers no way into what it left out', async ({ window }) => {
    // Each way in asks the same list; one that forgot would be a hole.
    const quickstart = window.locator('.home-quickstart')
    await expect(quickstart).toContainText('Create Index')
    await expect(quickstart).not.toContainText('Optimise Index')
    await expect(quickstart).not.toContainText('Price Index Derivatives')
    await expect(quickstart).not.toContainText('Report')

    expect((await searchResults(window, 'frontier')).join(' ')).not.toContain('Frontier')
    await window.keyboard.press('Escape')

    await window.getByRole('button', { name: 'Analysis', exact: true }).click()
    const analysis = window.getByRole('menu', { name: 'Analysis' })
    await expect(analysis).toContainText('Run backtest')
    await expect(analysis).not.toContainText('Run optimisation')
  })
})

test.describe('a development build', () => {
  test('keeps everything, since that is where the unfinished parts are built', async ({
    window
  }) => {
    for (const page of [...SHIPPED, ...WITHHELD]) {
      await expect(window.getByRole('button', { name: page, exact: true })).toBeVisible()
    }
    await expect(window.getByRole('button', { name: 'AI assistant' })).toBeVisible()
    expect((await searchResults(window, 'frontier')).join(' ')).toContain('Frontier')
  })
})
