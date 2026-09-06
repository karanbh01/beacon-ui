/**
 * The backtest job's result, which the OpenAPI contract does not describe.
 *
 * `JobStatus.result` is declared with no schema — py-beacon types it `Any`,
 * because one job registry carries every kind of job. So the shape of a
 * BACKTEST result cannot be generated, and this is the one place in the app
 * where a payload is described by hand. Everything here was read off a run
 * against py-beacon `d92e182` rather than inferred from its source.
 *
 * Names follow BN-155's redesign (BU-137). The one that moved:
 *
 *   benchmark_level  →  index_level
 *
 * It was always the TRACKED INDEX rebased to 100; the old name claimed the
 * wrong comparator once py-beacon split "the index this portfolio tracks"
 * from "the benchmark it is measured against". The two are different
 * questions and now have different fields.
 *
 * What is NOT here, and cannot be: the nested record payload
 * (`BacktestResultSummary` — `portfolio.nav`, `portfolio.cash`,
 * `portfolio.positions`, `portfolio.weights`, `portfolio.transactions`, the
 * comparator books) has no route in `d92e182`. It is a library-facing
 * serialisation, absent from `/openapi.json` and from this payload, so no
 * HTTP client can read it. Day-zero handling and truncation totals belong
 * with those fields and arrive when they do.
 */

/** A py-beacon `SeriesPayload`: parallel index and data arrays. */
export interface RunSeries {
  index: string[]
  data: (number | null)[]
}

export interface RunMetrics {
  total_return?: number | null
  annualised_return?: number | null
  volatility?: number | null
  sharpe_ratio?: number | null
  max_drawdown?: number | null
  /** Null when the run had no target index to replicate. */
  tracking_error?: number | null
  tracking_difference?: number | null
}

export interface BacktestRun {
  /** Portfolio NAV, rebased to 100. Trading days only — no day-zero row. */
  level: RunSeries
  /** The tracked index, rebased to 100 on the same axis. Was `benchmark_level`. */
  indexLevel: RunSeries
  drawdown: RunSeries
  /** Calendar year → return, as a fraction. */
  annualReturns: Record<string, number>
  metrics: RunMetrics
  /**
   * Comparison against an external benchmark.
   *
   * `undefined` means the run had none — "not measured", which is a
   * different statement from "measured and flat", and the view keeps them
   * different.
   */
  benchmark: RunMetrics | undefined
  totalCosts: number | undefined
  initialCapital: number | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function series(value: unknown): RunSeries {
  if (!isRecord(value)) return { index: [], data: [] }
  const index = Array.isArray(value.index) ? value.index : []
  const data = Array.isArray(value.data) ? value.data : []

  return {
    index: index.map((entry) => (typeof entry === 'string' ? entry : '')),
    data: data.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : null))
  }
}

function metrics(value: unknown): RunMetrics {
  if (!isRecord(value)) return {}
  const read = (key: string): number | null =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : null

  return {
    total_return: read('total_return'),
    annualised_return: read('annualised_return'),
    volatility: read('volatility'),
    sharpe_ratio: read('sharpe_ratio'),
    max_drawdown: read('max_drawdown'),
    tracking_error: read('tracking_error'),
    tracking_difference: read('tracking_difference')
  }
}

function numbers(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  const rows: Record<string, number> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) rows[key] = entry
  }
  return rows
}

/**
 * Read a job result as a backtest run, or `undefined` if it is not one.
 *
 * Defensive throughout, because the field it parses is untyped on the wire:
 * a result from a job of another kind, or from an engine a version ahead,
 * has to leave the pane empty rather than take the renderer down.
 */
export function parseRun(result: unknown): BacktestRun | undefined {
  if (!isRecord(result)) return undefined
  if (!isRecord(result.level) || !isRecord(result.metrics)) return undefined

  return {
    level: series(result.level),
    indexLevel: series(result.index_level),
    drawdown: series(result.drawdown),
    annualReturns: numbers(result.annual_returns),
    metrics: metrics(result.metrics),
    // Null and absent both mean "no benchmark was given". Only an object is
    // a measurement.
    benchmark: isRecord(result.benchmark) ? metrics(result.benchmark) : undefined,
    totalCosts: typeof result.total_costs === 'number' ? result.total_costs : undefined,
    initialCapital: typeof result.initial_capital === 'number' ? result.initial_capital : undefined
  }
}

/**
 * Rebase a series so its first real value is 100.
 *
 * The job payload arrives rebased; a stored record carries the portfolio's
 * NAV in currency. Rebasing here rather than in the pane means a run looks
 * the same wherever it was read from, which is the whole point of reading
 * both into one shape.
 */
function rebased(source: RunSeries): RunSeries {
  const base = source.data.find((value) => value !== null && value !== 0)
  if (base === null || base === undefined) return source

  return {
    index: source.index,
    data: source.data.map((value) => (value === null ? null : (value / base) * 100))
  }
}

/**
 * Read a STORED backtest record as the same run (BN-158, BU-169).
 *
 * The record and a job result describe one run in two shapes, so this reads
 * into `BacktestRun` and the pane keeps a single contract: a second source,
 * not a second code path. What the record does not carry — drawdown, calendar
 * returns — the pane already derives from the level series, so nothing is
 * missing by leaving them empty.
 *
 * Two things worth knowing about the shapes:
 *
 * - `index` is a CONTAINER and is never null; `index.target` is the one that
 *   can be (BN-164). A guard written against the container would never fire.
 * - `portfolio.nav` includes day zero, where a job result starts at the first
 *   traded close. So a record's 100 is the starting capital — one extra
 *   leading point, which is real rather than a discrepancy.
 */
export function parseRecord(result: unknown): BacktestRun | undefined {
  if (!isRecord(result)) return undefined
  const portfolio = result.portfolio
  if (!isRecord(portfolio) || !isRecord(result.metrics)) return undefined

  const books = isRecord(result.index) ? result.index : {}
  const target = isRecord(books.target) ? books.target : undefined
  const benchmark = isRecord(result.benchmark) ? result.benchmark : undefined

  return {
    level: rebased(series(portfolio.nav)),
    indexLevel: rebased(series(target?.levels)),
    // Derived by the pane from the level series, as they always were.
    drawdown: { index: [], data: [] },
    annualReturns: {},
    metrics: metrics(result.metrics),
    /*
     * A comparator BOOK, not a metrics block.
     *
     * The record stores what the benchmark did rather than the comparison —
     * so a measured benchmark is a book here, and the numbers the pane shows
     * against it come from the run's own metrics (`tracking_error`,
     * `tracking_difference`). An absent book still means "not measured",
     * which is the distinction the pane keeps.
     */
    benchmark: benchmark === undefined ? undefined : metrics(result.metrics),
    totalCosts: undefined,
    initialCapital:
      typeof portfolio.initial_capital === 'number' ? portfolio.initial_capital : undefined
  }
}
