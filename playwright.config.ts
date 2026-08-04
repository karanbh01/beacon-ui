import { defineConfig } from '@playwright/test'

/**
 * E2E against the real Electron app (BU-35).
 *
 * Serial, and not as a placeholder: each test launches its own Electron
 * process with its own profile, and running several at once on a laptop makes
 * the perf budgets measure contention rather than the app.
 */
export default defineConfig({
  testDir: './e2e',
  // A cold Electron launch plus a first paint is seconds, not milliseconds.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  // Local runs should surface a flake rather than paper over it; CI retries
  // once, because a cold runner genuinely is slower than a warm laptop.
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
