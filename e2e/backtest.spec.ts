import { expect, openPage, test } from './fixtures'

/**
 * Reading a finished backtest (BU-137).
 *
 * The stub answers the submission with a job that is already done and whose
 * result carries BN-155's shape — `index_level` rather than `benchmark_level`,
 * and a null benchmark when none was asked for.
 */
test('draws the portfolio against the index it tracked', async ({ window }) => {
  await openPage(window, 'Beacon View')

  /*
   * Opened from the palette, pinned to an index in one gesture.
   *
   * Backtest is a `pinned` view: the new-tab menu offers it only beside an
   * open document, and it needs an index to run against either way. The
   * intent row — a view and a subject in one query — is the shortest route
   * to both.
   */
  await window.getByRole('combobox', { name: 'Search' }).fill('backtest TECH10')
  await window
    .getByRole('option', { name: /Backtest/ })
    .first()
    .click()

  await window.getByRole('button', { name: 'Run backtest' }).click()

  // Two lines: what the simulation did, and what it was tracking. The second
  // comes from `index_level`, which was `benchmark_level` before BN-155.
  await expect(window.getByText('TECH10 portfolio')).toBeVisible()
  await expect(window.getByText('TECH10 index')).toBeVisible()

  // A run given no benchmark says so rather than reporting a dash.
  await expect(window.getByText('not measured')).toBeVisible()

  await expect(window.getByText(/portfolio NAV against the tracked index/)).toBeVisible()
})

test('a run given a benchmark measures it, and says so', async ({ window }) => {
  await openPage(window, 'Beacon View')
  await window.getByRole('combobox', { name: 'Search' }).fill('backtest TECH10')
  await window
    .getByRole('option', { name: /Backtest/ })
    .first()
    .click()

  await window.getByLabel('Benchmark').selectOption('EU-VALUE')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  // Measured: the "not measured" line belongs to a run that had none, and
  // the two must not read the same (BU-137).
  await expect(window.getByText('not measured')).toHaveCount(0)
  await expect(window.getByText('BENCHMARK CAGR')).toBeVisible()
})

test('a run that cannot happen says why, in py-beacon’s own words', async ({ window }) => {
  /*
   * BN-161 made an unresolvable universe a FAILURE rather than a dead level
   * of zero, and this app had nowhere to put one: the pane fell through to
   * "no backtest run yet", and the tray clipped four hundred characters of
   * explanation at the width of a card (BU-162).
   */
  await openPage(window, 'Beacon View')
  await window.getByRole('combobox', { name: 'Search' }).fill('backtest NO-UNIVERSE')
  await window
    .getByRole('option', { name: /Backtest/ })
    .first()
    .click()

  await window.getByRole('button', { name: 'Run backtest' }).click()

  // In the pane, where the result would have been.
  await expect(window.getByText('The backtest did not run.')).toBeVisible()
  await expect(window.getByText(/universe_identifiers/).first()).toBeVisible()

  // And not standing in for it: the overview is never asked for a result
  // that was not written, so no 404 reports the wrong thing.
  await expect(window.getByText('Not found.')).toHaveCount(0)
  await expect(window.getByText('No backtest run yet in this session.')).toHaveCount(0)

  // The tray's half of this is a unit test: it is fed by the event socket,
  // and the stub has none — every job here is finished on arrival.
})

test('opens on an empty page and picks its own index', async ({ window }) => {
  /*
   * BU-164. Backtest was a `pinned` view, so the tab menu offered it only
   * beside an open document — and the only document view in the app is on
   * another page, which left every entry on Beacon View greyed out for good
   * (BU-163). It holds its own subject now.
   */
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()

  const entry = window.getByRole('menuitem', { name: 'Backtest', exact: true })
  await expect(entry).toBeEnabled()
  await entry.click()

  await expect(window.getByText('Choose an index to back-test.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Run backtest' })).toBeDisabled()

  // The catalogue, not a typed identifier: it is a short closed list.
  await window.getByLabel('Index', { exact: true }).selectOption('TECH10')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('TECH10 portfolio')).toBeVisible()
  // The overview is a supplement here, so its 404 does not sit above a
  // drawn result saying "Not found" (BU-164).
  await expect(window.getByText('Not found.')).toHaveCount(0)
})

test('shows a stored run without re-running it', async ({ window }) => {
  /*
   * BU-169. The pane only ever drew a run it had started itself, so an index
   * back-tested last week said "no backtest run yet in this session" — true
   * of the session and false of the index. `/beacon/{index_id}/record` is
   * what the engine kept (BN-158).
   */
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await window.getByLabel('Index', { exact: true }).selectOption('TECH10')

  // Drawn without pressing Run.
  await expect(window.getByText('TECH10 portfolio')).toBeVisible()
  await expect(window.getByText('TECH10 index')).toBeVisible()

  // And said to be stored, with its age: it may predate the definition on
  // screen, and its NAV opens at day zero rather than the first traded close.
  await expect(window.getByText(/stored run, captured 3d ago/)).toBeVisible()

  // A single day-zero observation is not a calendar year that went nowhere,
  // so no 0.0% row for the year before the run.
  await expect(window.getByText('2024')).toHaveCount(0)
})

test('an index nobody has back-tested says so, about the index', async ({ window }) => {
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await window.getByLabel('Index', { exact: true }).selectOption('EU-VALUE')

  await expect(window.getByText('This index has never been back-tested.')).toBeVisible()
})

test('an optimised index can be the benchmark, which is the point of one', async ({ window }) => {
  /*
   * BU-172. py-beacon refused a derived index as a benchmark until its #182
   * — an accident of resolution rather than a rule, since a benchmark needs
   * nothing but a level series. The comparison it blocked is the one the
   * whole feature is for: a parent against its own optimised child answers
   * "what did the constraints cost?".
   */
  await openPage(window, 'Beacon View')
  await window.locator('[data-pane="0"]').getByRole('button', { name: 'New tab' }).click()
  await window.getByRole('menuitem', { name: 'Backtest', exact: true }).click()
  await window.getByLabel('Index', { exact: true }).selectOption('TECH10')

  const benchmark = window.getByLabel('Benchmark')
  await expect(benchmark.locator('option', { hasText: 'TECH10-OPT' })).toHaveCount(1)

  await benchmark.selectOption('TECH10-OPT')
  await window.getByRole('button', { name: 'Run backtest' }).click()

  await expect(window.getByText('not measured')).toHaveCount(0)
  await expect(window.getByText('BENCHMARK CAGR')).toBeVisible()
})
