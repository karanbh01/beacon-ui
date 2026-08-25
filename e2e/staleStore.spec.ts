import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { test as base } from './fixtures'

const ROOT = join(__dirname, '..')

/**
 * The offer to replace a store this app generated (BU-89).
 *
 * The marker has to exist BEFORE Electron starts — the engine reads it on its
 * first health poll — so `app` is launched here rather than by the shared
 * fixture, which has no reason to know about markers.
 */
const test = base.extend({
  app: async ({ engine }, use, testInfo) => {
    const profile = testInfo.outputPath('profile')
    mkdirSync(profile, { recursive: true })
    writeFileSync(
      join(profile, 'store-provenance.json'),
      JSON.stringify({
        engineVersion: '0.0.1-ancient',
        args: ['-m', 'beacon.synthetic', '--seed', '42'],
        generatedAt: '2026-01-01T00:00:00.000Z'
      }),
      'utf-8'
    )

    const app = await electron.launch({
      args: [ROOT, `--user-data-dir=${profile}`],
      env: {
        ...process.env,
        BEACON_SERVER_URL: engine.url,
        BEACON_NO_SYNTHETIC: '1',
        BEACON_NO_UPDATE: '1'
      }
    })
    await use(app)
    await app.close()
  }
})

test('offers to replace a store older than the app, and takes no for an answer', async ({
  window
}) => {
  const notice = window.getByRole('complementary', { name: 'Data store is out of date' })
  await expect(notice).toBeVisible()
  // The engine's own words, so the reason is never invented in the renderer.
  await expect(notice).toContainText('0.0.1-ancient')

  // Nothing has happened yet and nothing will unless it is asked for.
  await expect(notice.getByRole('button', { name: 'Replace data…' })).toBeVisible()

  await notice.getByRole('button', { name: 'Not now' }).click()
  await expect(notice).toBeHidden()
})

base('says nothing about a store it did not generate', async ({ window }) => {
  // No marker in this profile, so the app has no standing to judge the
  // store — the guarantee that matters most, since the offer deletes data.
  await expect(
    window.getByRole('complementary', { name: 'Data store is out of date' })
  ).toHaveCount(0)
})
