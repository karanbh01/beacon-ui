import { expect, test } from './fixtures'

/**
 * Links leave the app rather than replacing it (BU-112).
 *
 * The splash carried an `<a href>` to GitHub. `setWindowOpenHandler` only
 * sees `window.open` and `target="_blank"`, so a same-window navigation went
 * straight through and swapped the app for a web page — in a frameless
 * window with no way back.
 */

test('the repo button opens outside the app, and the window stays put', async ({ window, app }) => {
  // Intercept in main: actually launching a browser in CI is not the point.
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { opened: string[] }).opened = opened
    shell.openExternal = (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  })

  const before = window.url()
  await window.getByRole('button', { name: 'Repository' }).click()

  const opened = await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)
  expect(opened).toContain('https://github.com/karanbh01/beacon-ui')
  // Still the app, not github.com.
  expect(window.url()).toBe(before)
})

test('a navigation away from the app’s own origin is refused', async ({ window, app }) => {
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { opened: string[] }).opened = opened
    shell.openExternal = (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  })

  const before = window.url()
  // Exactly what the old `<a href>` did.
  await window.evaluate(() => {
    globalThis.location.href = 'https://example.com/'
  })
  await window.waitForTimeout(500)

  expect(window.url()).toBe(before)
  const opened = await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)
  expect(opened).toContain('https://example.com/')
})
