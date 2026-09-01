import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * A py-beacon-shaped server, with no py-beacon in it.
 *
 * The engine already knows how to attach to one rather than spawn it —
 * `BEACON_SERVER_URL`, which exists for the dev loop where py-beacon is being
 * edited in another terminal — so the E2E suite borrows that seam. No python,
 * no synthetic generation, no interpreter to locate, and above all the same
 * numbers every run: a screenshot baseline is worthless against data that
 * moves.
 *
 * Deliberately NOT a mock of the client. The app makes real HTTP requests
 * against real JSON here, so the typed client, the query layer, the cache
 * keys and the error paths are all exercised.
 */

/**
 * The engine's error envelope, and the codes it actually uses (BU-88).
 *
 * Every one of these was probed against a running py-beacon rather than
 * guessed. The stub used to answer generously wherever the engine is strict,
 * which is the worst way for a fake to be wrong: a test passes, the same code
 * meets a real engine, and the failure lands on the user. Four bugs reached
 * Karan that way — an unknown column that 422s, a `{id, name}` where whole
 * documents come back, an id that never 404s, and reference data served for
 * the wrong instrument entirely.
 */
interface Refusal {
  status: number
  payload: unknown
}

function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && 'status' in value && 'payload' in value
}

function refuse(status: number, code: string, message: string, detail?: unknown): Refusal {
  return {
    status,
    payload: { error: { code, message, ...(detail === undefined ? {} : { detail }) } }
  }
}

/** `Data not found: market data for 'ZZZ'. (Source: MarketData)` */
function notFound(description: string, source: string): Refusal {
  return refuse(404, 'DATA_NOT_FOUND', `Data not found: ${description}. (Source: ${source})`, {
    data_description: description,
    source
  })
}

/**
 * The pattern every document id must match, and the engine's own 422 for it.
 *
 * BU-87 was exactly this: the app sent a tab title as an index id and the
 * engine refused a space. The stub answered anyway, so nothing caught it.
 */
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,64}$/

function badId(field: string, value: string): Refusal {
  return refuse(422, 'VALIDATION_ERROR', 'Request validation failed.', {
    errors: [
      {
        type: 'string_pattern_mismatch',
        loc: ['path', field],
        msg: `String should match pattern '${DOCUMENT_ID.source}'`,
        input: value
      }
    ]
  })
}

/**
 * Reference columns this dataset carries, upper-case as the engine spells
 * them. Naming one it does not have is a 422, not a null — that is the whole
 * of BU-85, where the client asked for three invented columns and every
 * detail column came back empty against a real engine while the stub
 * fabricated whatever was requested.
 */
const REFERENCE_COLUMNS = [
  'COUNTRY_DOMICILE',
  'COUNTRY_LISTING',
  'CURRENCY',
  'DATE_FROM',
  'DATE_TO',
  'EXCHANGE',
  'NAME',
  'REGION',
  'SECTOR',
  'SUB_INDUSTRY'
]

/**
 * Jobs this stub has accepted, by id. Submitting a backtest adds one.
 *
 * Finished on arrival: the socket the real engine pushes progress over is
 * not part of this stub, and a job that is already done is the state a
 * result reader cares about.
 */
const jobs = new Map<string, unknown>()

/** Two years of trading days from a fixed start, so runs are comparable. */
function runSeries(base: number, drift: number): { index: string[]; data: number[] } {
  const index: string[] = []
  const data: number[] = []
  let level = base
  const day = new Date(Date.UTC(2025, 0, 2))

  for (let n = 0; n < 260; n++) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      index.push(`${day.toISOString().slice(0, 10)}T00:00:00`)
      // Deterministic, and shaped enough that a chart is not a straight line.
      level *= 1 + drift + Math.sin(n / 9) / 400
      data.push(Number(level.toFixed(4)))
    }
    day.setUTCDate(day.getUTCDate() + 1)
  }

  return { index, data }
}

/** The result payload of a completed backtest, as `d92e182` sends it. */
function backtestResult(withBenchmark: boolean): Record<string, unknown> {
  const level = runSeries(100, 0.0004)
  const indexLevel = runSeries(100, 0.00042)

  return {
    level,
    // Renamed from `benchmark_level` in BN-155: the tracked index, rebased.
    index_level: indexLevel,
    returns: { index: level.index.slice(1), data: level.data.slice(1).map(() => 0.0004) },
    drawdown: { index: level.index, data: level.data.map(() => 0) },
    annual_returns: { '2025': 0.1042, '2026': 0.0631 },
    metrics: {
      total_return: 0.1731,
      annualised_return: 0.1042,
      volatility: 0.1183,
      sharpe_ratio: 0.88,
      max_drawdown: -0.0642,
      tracking_error: 0.0019,
      tracking_difference: -0.0004
    },
    // Null when the run had none. Not an empty object.
    benchmark: withBenchmark
      ? { tracking_error: 0.0271, tracking_difference: 0.0122, correlation: 0.86 }
      : null,
    rebalances: [],
    total_costs: 8412.5,
    initial_capital: 1_000_000
  }
}

/** Computed on request rather than stored, so it is legal in `fields`. */
const DERIVED_COLUMNS = ['adv_3m', 'market_cap', 'free_float_market_cap']

/**
 * Fixed, because every assertion below is written against these.
 *
 * A `TableFrame` — index / columns / data — not a list of bar objects. That
 * is what py-beacon puts on the wire (a pandas frame, row-oriented) and the
 * distinction is not cosmetic: `summarise` resolves its columns by name off
 * `columns`, so a stub that served `{ bars: [...] }` renders an empty table
 * with no error anywhere.
 */
const PRICE_COLUMNS = ['open', 'high', 'low', 'close', 'volume']
/*
 * 240 sessions ENDING TODAY, not at a fixed date in 2025.
 *
 * Anchored to the past, every range control eventually pointed at a window
 * with no data in it — a `1M` that starts after the last bar is empty, and a
 * view that draws nothing is indistinguishable from a view that is broken.
 * py-beacon's synthetic data ends today for the same reason (BU-141).
 */
const LAST_SESSION = new Date()

const PRICES = {
  index: Array.from({ length: 240 }, (_, i) =>
    new Date(LAST_SESSION.getTime() - (239 - i) * 86_400_000).toISOString().slice(0, 10)
  ),
  columns: PRICE_COLUMNS,
  data: Array.from({ length: 240 }, (_, i) => {
    const base = 140 + Math.sin(i / 9) * 8 + i * 0.04
    return [
      Number((base - 0.4).toFixed(2)),
      Number((base + 1.1).toFixed(2)),
      Number((base - 1.3).toFixed(2)),
      Number(base.toFixed(2)),
      40_000 + ((i * 977) % 60_000)
    ]
  })
}

const IDENTIFIERS = Array.from({ length: 120 }, (_, i) => `CMP${String(i).padStart(3, '0')}`)

/**
 * One identifier the reference dataset carries and the market one does not,
 * so the `datasets` marking has something real to mark (BN-127).
 */
const REFERENCE_ONLY = 'REFONLY'

/** Everything the stub will admit to knowing. Anything else 404s. */
/**
 * Currency pairs (BN-144/145). They come through the SAME prices endpoint as
 * an instrument, which is what makes them free for the Prices view — there is
 * no `/data/fx`, and a pair is just another identifier.
 */
const PAIRS = ['EURUSD', 'GBPUSD', 'JPYUSD']

const KNOWN = new Set([...IDENTIFIERS, REFERENCE_ONLY, ...PAIRS])

function datasetsFor(identifier: string): string[] {
  if (identifier === REFERENCE_ONLY) return ['reference']
  // A pair is market data and nothing else — no reference row, no actions.
  // Verified against a running engine, which answers exactly this.
  if (PAIRS.includes(identifier)) return ['market']
  return ['market', 'reference', 'corporate_actions']
}

/**
 * Ranking is the SERVER's job in the real engine, so the stub has to do it
 * too — a client that re-ranked would pass here and fail against py-beacon.
 */
function rankOf(needle: string, identifier: string, name: string): number {
  const id = identifier.toLowerCase()
  const label = name.toLowerCase()
  if (id === needle) return 0
  if (id.startsWith(needle)) return 1
  if (label.startsWith(needle)) return 2
  if (id.includes(needle)) return 3
  if (label.includes(needle)) return 4
  return Number.POSITIVE_INFINITY
}

function searchIdentifiers(url: URL): unknown {
  const needle = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Number(url.searchParams.get('limit') ?? '20')
  const wanted = url.searchParams.get('datasets')

  const all = [...KNOWN].map((identifier) => ({
    identifier,
    // Pairs carry no name, as the engine returns them.
    name: PAIRS.includes(identifier) ? null : `${identifier} Corporation`,
    datasets: datasetsFor(identifier)
  }))

  const covered = wanted === null ? all : all.filter((row) => row.datasets.includes(wanted))

  const matched =
    needle === ''
      ? covered
      : covered
          .map((row) => ({ row, score: rankOf(needle, row.identifier, row.name ?? '') }))
          .filter((entry) => Number.isFinite(entry.score))
          .sort((a, b) => a.score - b.score || a.row.identifier.localeCompare(b.row.identifier))
          .map((entry) => entry.row)

  return {
    identifiers: matched.slice(0, limit),
    total: matched.length,
    truncated: matched.length > limit,
    version: 'stub-1'
  }
}

/**
 * When each synthetic name started trading (BU-92).
 *
 * Every fourth one lists late, so a point-in-time request has something to
 * exclude. The engine expresses this through DATE_FROM/DATE_TO and answers
 * `found: false` for a row that is not valid on the requested date; the stub
 * only has to reproduce the ANSWER, since that is all a client reads.
 */
function listedFrom(index: number): string {
  return index % 4 === 0 ? '2020-01-01' : '2015-01-01'
}

function referenceEntry(identifier: string, index: number): Record<string, unknown> {
  return {
    identifier,
    found: true,
    // The columns a real engine carries after BN-128, including the two
    // country columns it deliberately keeps apart.
    fields: {
      date_from: listedFrom(index),
      name: `${identifier} Corporation`,
      gics_sector: ['Information Technology', 'Financials', 'Health Care'][index % 3],
      gics_sub_industry: 'Application Software',
      region: ['United States', 'Europe', 'Japan'][index % 3],
      exchange: ['XNAS', 'XLON', 'XTKS'][index % 3],
      currency: ['USD', 'GBP', 'JPY'][index % 3],
      country_listing: ['US', 'GB', 'JP'][index % 3],
      // Deliberately not the listing country for some names: that difference
      // is the whole reason the engine keeps two columns.
      country_domicile: ['US', 'IE', 'JP'][index % 3],
      free_float_market_cap: 3.16e12 - index * 1.1e10,
      // Larger than the free float, as it must be: free float is a subset.
      market_cap: (3.16e12 - index * 1.1e10) / 0.73,
      adv_3m: 4_182_000 - index * 9_000
    }
  }
}

/**
 * The document Figma 234:6070 draws, served for ANY index id.
 *
 * Without it every index 404s into a blank draft and the methodology renders
 * one weighting row and nothing else — which tests nothing about how a
 * pipeline actually looks. The 404-is-a-new-index path is covered by a unit
 * test, so the stub does not need to reproduce it.
 */
function indexDocument(id: string): unknown {
  return {
    id,
    name: 'Beacon US Technology Top 10',
    description: '',
    currency: 'USD',
    base_date: '2019-12-31',
    base_value: 100,
    rebalancing_frequency: 'QUARTERLY',
    return_type: 'NET_TOTAL_RETURN',
    rebalance_day_rule: 'THIRD_FRIDAY',
    effective_lag_sessions: 0,
    withholding_tax_rate: 0,
    universe: { universe_id: 'US-LARGECAP' },
    pipeline: {
      selection: [
        { id: 'rule-1', type: 'FilterRule', params: { gics_sector: 'Information Technology' } },
        { id: 'rule-2', type: 'FilterRule', params: { min_free_float_market_cap: 50_000_000_000 } },
        { id: 'rule-3', type: 'RankRule', params: { by: 'free_float_market_cap', order: 'desc' } },
        { id: 'rule-4', type: 'SelectionRule', params: { top: 10 } }
      ],
      weighting: {
        id: 'weighting',
        scheme: 'FreeFloatMarketCapWeighted',
        params: {},
        max_weight: 0.2
      },
      treatment: { corporate_actions: 'ADJUST_DIVISOR' }
    }
  }
}

const ROUTES: Record<string, unknown> = {
  '/health': { status: 'ok', version: '0.0.2', cache_age: 120 },
  '/data/coverage': {
    identifiers_union: 512,
    cache_size_bytes: 14_680_064,
    datasets: [
      {
        // BN-145 reports pairs as their own dataset. The Coverage view draws
        // whatever rows arrive, so this is the whole of BU-100.
        dataset: 'fx',
        configured: true,
        identifiers: 3,
        source: 'synthetic',
        frequency: 'daily',
        field_count: 1,
        start: '2021-01-04',
        end: '2026-08-03',
        cache_age: 30,
        last_refreshed: '2026-08-04T06:00:00Z'
      },
      {
        dataset: 'market',
        configured: true,
        identifiers: 512,
        source: 'synthetic',
        frequency: 'daily',
        field_count: 6,
        stale_after_seconds: 86_400,
        start: '2021-01-04',
        end: '2026-08-03',
        cache_age: 30,
        last_refreshed: '2026-08-04T06:00:00Z'
      },
      {
        dataset: 'reference',
        configured: true,
        identifiers: 512,
        source: 'synthetic',
        frequency: 'static',
        field_count: 11,
        stale_after_seconds: null,
        start: null,
        end: null,
        cache_age: 30,
        last_refreshed: '2026-08-04T06:00:00Z'
      }
    ]
  },
  // Whole documents, as the endpoint returns — the overview reads a
  // universe and a rebalance frequency off each row (BU-95).
  // Two, so a benchmark can be chosen against one of them (BU-137): the
  // measured and the not-measured readings of a run are different code paths.
  '/indices': { indices: [indexDocument('TECH10'), indexDocument('EU-VALUE')] },
  '/data/watchlists': { watchlists: [] }
}

/**
 * Universes, mutable for the run (BN-132, BU-78).
 *
 * A `seeded` one the engine wrote and refuses to change, and whatever the
 * test creates. Held in a module variable rather than in ROUTES because the
 * point of BU-78 is that the list GROWS — a frozen catalogue would let a
 * create "succeed" against a list that never changed and prove nothing.
 */
interface StubUniverse {
  id: string
  name: string
  description: string | null
  identifiers: string[]
  source: 'user' | 'seeded'
}

let universes: StubUniverse[] = []

function resetUniverses(): void {
  universes = [
    {
      id: 'GLOBAL',
      name: 'All loaded assets',
      description: 'Everything in the loaded dataset.',
      identifiers: [...IDENTIFIERS],
      source: 'seeded'
    }
  ]
}
resetUniverses()

/** The server derives an id from the name, so the client cannot choose one. */
function deriveId(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function body(url: URL): unknown {
  const path = url.pathname

  if (Object.hasOwn(ROUTES, path)) return ROUTES[path]

  if (path === '/data/identifiers') return searchIdentifiers(url)

  if (path.startsWith('/indices/')) {
    const id = decodeURIComponent(path.slice('/indices/'.length))
    if (id === '' || id.includes('/')) return undefined
    // BU-87 in one line: the app sent a tab TITLE here and the engine
    // refused the space. This answered anyway, so nothing caught it.
    if (!DOCUMENT_ID.test(id)) return badId('index_id', id)
    return indexDocument(id)
  }

  if (path.startsWith('/data/prices/')) {
    // Unknown identifiers 404 rather than serving bars for anything asked
    // for. Without this no test could tell a real ticker from a typo, which
    // is the whole point of the not-found path.
    const identifier = path.split('/').pop() ?? ''
    if (!KNOWN.has(identifier) || identifier === REFERENCE_ONLY) {
      return notFound(`market data for '${identifier}'`, 'MarketData')
    }

    // Echo the interval asked for (BU-106). It was hard-coded 'native', so a
    // client that never sent the parameter looked identical to one that did.
    const interval = url.searchParams.get('interval') ?? 'native'

    /*
     * `start` and `end` narrow the window (BU-141).
     *
     * Ignored until now, so every range control on every view got the same
     * 240 bars and a client that never sent a date looked identical to one
     * that did — the same shape of blindness `interval` had before BU-88.
     */
    const from = url.searchParams.get('start') ?? ''
    const to = url.searchParams.get('end') ?? ''
    const within = PRICES.index
      .map((date, position) => ({ date, position }))
      .filter((row) => (from === '' || row.date >= from) && (to === '' || row.date <= to))
    const windowed = {
      ...PRICES,
      index: within.map((row) => row.date),
      data: within.map((row) => PRICES.data[row.position] ?? [])
    }

    // `adjusted` ADDS a column rather than replacing one (BN-146), so a client
    // that never sends it must see no ADJ_CLOSE at all.
    const adjusted = url.searchParams.get('adjusted') === 'true'
    const prices = adjusted
      ? {
          ...windowed,
          columns: [...windowed.columns, 'ADJ_CLOSE'],
          data: windowed.data.map((row) => [...row, Number(row[3]) * 0.97])
        }
      : windowed

    return { identifier, interval, prices }
  }

  /*
   * A page of a stored table (BN-147), filtered by identifier (BU-113).
   *
   * The filter is the point: without it the only way to reach one name's
   * rows was to page the whole dataset. A stub that ignored `identifiers`
   * would let a client forget to send it and still look right.
   */
  if (path.startsWith('/data/tables/')) {
    const dataset = decodeURIComponent(path.slice('/data/tables/'.length))
    if (dataset !== 'features') return undefined

    const wanted = url.searchParams.getAll('identifiers').flatMap((value) => value.split(','))
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '1000'), 1000)
    const offset = Number(url.searchParams.get('offset') ?? '0')

    // Two quarters per name, so "newest first" is observable rather than
    // assumed, and every row carries its own provenance.
    const rows: unknown[][] = []
    for (const identifier of wanted.length > 0 ? wanted : IDENTIFIERS) {
      const index = IDENTIFIERS.indexOf(identifier)
      if (index < 0) continue
      for (const [at, quarter] of [
        ['2026-07-31T00:00:00', '2026Q2'],
        ['2026-04-30T00:00:00', '2026Q1']
      ] as const) {
        rows.push([
          identifier,
          at,
          'fundamentals',
          'eps',
          16.6 - index * 0.05,
          `reported ${quarter}`
        ])
        rows.push([identifier, at, 'fundamentals', 'pe_ratio', 10.4 + index * 0.02, null])
      }
    }

    const page = rows.slice(offset, offset + limit)
    return {
      dataset,
      offset,
      limit,
      total: rows.length,
      rows: {
        index: page.map((_row, position) => offset + position),
        columns: ['IDENTIFIER', 'DATE', 'TYPE', 'FIELD', 'VALUE', 'DETAIL'],
        data: page
      }
    }
  }

  if (path === '/data/features/catalogue') {
    return {
      types: [
        { type: 'fundamentals', fields: ['eps', 'pe_ratio'], identifiers: 120, rows: 240 },
        { type: 'alternative', fields: ['x_sentiment'], identifiers: 60, rows: 60 }
      ],
      fields: ['eps', 'pe_ratio', 'x_sentiment']
    }
  }

  if (path.startsWith('/data/features/')) {
    const identifier = path.slice('/data/features/'.length)
    const index = IDENTIFIERS.indexOf(identifier)
    if (index < 0) return undefined

    // Every catalogue field comes back, nulls included — that is what the
    // engine does, and the view draws "held nothing" as an answer.
    const alternative = index % 2 === 0 ? 0.42 - index * 0.001 : null
    return {
      identifier,
      as_of: '2026-08-03',
      features: [
        {
          field: 'eps',
          value: 16.6 - index * 0.05,
          type: 'fundamentals',
          detail: 'period ending 2026-06-30, reported 2026Q2',
          date: '2026-07-31'
        },
        {
          field: 'pe_ratio',
          value: 10.4 + index * 0.02,
          type: 'fundamentals',
          detail: null,
          date: '2026-07-31'
        },
        {
          field: 'x_sentiment',
          value: alternative,
          type: alternative === null ? null : 'alternative',
          detail: null,
          date: alternative === null ? null : '2026-08-02'
        }
      ]
    }
  }

  if (path === '/data/reference') {
    const wanted = url.searchParams.getAll('identifiers').flatMap((value) => value.split(','))
    const ids = wanted.length > 0 ? wanted : IDENTIFIERS
    const date = url.searchParams.get('date') ?? ''

    // An unknown column is a HARD refusal — the whole batch, not a null in
    // one field. BU-85 shipped three invented column names because this
    // returned whatever was asked for.
    const fields = url.searchParams.getAll('fields').flatMap((value) => value.split(','))
    const unknown = fields.filter(
      (field) =>
        field !== '' &&
        !REFERENCE_COLUMNS.includes(field.toUpperCase()) &&
        !DERIVED_COLUMNS.includes(field)
    )
    if (unknown.length > 0) {
      return refuse(
        422,
        'INVALID_RULE',
        `Invalid rule: fields. Reason: unknown reference column(s): ${unknown.join(', ')}. ` +
          `Available: ${REFERENCE_COLUMNS.join(', ')}`
      )
    }

    // "Returns only rows valid then" — the endpoint's own words. A name not
    // yet listed comes back `found: false` with no fields, exactly as a real
    // engine answers it, rather than being omitted from the response.
    const entries = ids.map((identifier, index) => {
      const entry = referenceEntry(identifier, index)
      if (date === '' || date >= listedFrom(index)) return entry
      return { identifier, found: false, fields: null }
    })

    return { as_of: date === '' ? '2026-08-04' : date, entries }
  }

  if (path.startsWith('/data/reference/')) {
    // The identifier ASKED FOR, not CMP000's row for everything. It served
    // one instrument's fields under every name, so the view looked right
    // while showing the wrong company — and no test could tell.
    const identifier = decodeURIComponent(path.slice('/data/reference/'.length))
    const index = IDENTIFIERS.indexOf(identifier)
    if (index < 0 && identifier !== REFERENCE_ONLY) {
      return notFound(`reference data for '${identifier}'`, 'ReferenceData')
    }

    return {
      identifier,
      fields: referenceEntry(identifier, Math.max(index, 0)).fields,
      /*
       * Where this instrument is used (BN-132, BU-143).
       *
       * The engine answers this so a client does not have to read every
       * universe and search it — and a stub that omitted it would let a
       * view go on inventing memberships from reference fields that do not
       * exist, which is exactly what BU-143 removed.
       */
      universes: universes
        .filter((universe) => universe.identifiers.includes(identifier))
        .map((universe) => ({
          id: universe.id,
          name: universe.name,
          source: universe.source === 'seeded' ? 'seeded' : 'user'
        }))
    }
  }

  if (path.startsWith('/data/corporate-actions/')) {
    const identifier = decodeURIComponent(path.slice('/data/corporate-actions/'.length))
    if (!IDENTIFIERS.includes(identifier)) {
      return notFound(`instrument '${identifier}'`, 'MarketData')
    }

    return {
      identifier,
      actions: [
        {
          ex_date: '2026-05-09',
          pay_date: '2026-05-23',
          status: 'paid',
          type: 'DIVIDEND',
          kind: 'cash',
          value: 0.26
        },
        {
          ex_date: '2025-08-31',
          pay_date: null,
          status: 'announced',
          type: 'SPLIT',
          kind: 'ratio',
          value: 4
        },
        {
          ex_date: '2025-03-02',
          pay_date: null,
          status: null,
          type: 'SPIN_OFF',
          kind: 'structural',
          value: 1
        }
      ],
      cumulative_split_ratio: 4,
      trailing_dividend: 0.98,
      trailing_dividend_yield: 0.0049
    }
  }

  /*
   * A finished backtest job, in the shape BN-155 left (BU-137).
   *
   * `index_level` and not `benchmark_level`: the series is the TRACKED
   * INDEX, and the old name claimed the wrong comparator. A stub still
   * emitting the old name would green-light a reader that cannot read a
   * current engine, which is the whole reason this file is as strict as it
   * is (BU-88).
   *
   * `benchmark` is null unless the run was given one — "not measured" is a
   * different statement from "measured and flat", and the client has to keep
   * them apart.
   */
  if (path.startsWith('/jobs/')) {
    const jobId = decodeURIComponent(path.slice('/jobs/'.length))
    const job = jobs.get(jobId)
    if (job === undefined) return notFound('job', jobId)
    return job
  }

  if (path === '/universes') return { universes }

  if (path.endsWith('/members') && path.startsWith('/universes/')) {
    const id = decodeURIComponent(path.slice('/universes/'.length, -'/members'.length))
    if (!DOCUMENT_ID.test(id)) return badId('universe_id', id)
    const found = universes.find((universe) => universe.id === id)
    return found === undefined
      ? undefined
      : { universe_id: found.id, identifiers: found.identifiers }
  }

  return undefined
}

/**
 * Complete the WebSocket handshake and then say nothing.
 *
 * The renderer opens `/ws` for the event feed. Refusing the upgrade leaves a
 * failed-connection error in every test's console, which would make "no
 * console errors" a useless assertion — so the socket opens and stays quiet.
 * Nothing here needs to push events; the tests drive the UI, not the engine.
 */
function acceptSocket(request: IncomingMessage, socket: Duplex): boolean {
  const key = request.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return false
  }
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      ''
    ].join('\r\n')
  )
  return true
}

export interface StubEngine {
  url: string
  close: () => Promise<void>
}

/**
 * Writes to the universe collection (BN-132).
 *
 * The stub enforces what the engine enforces — a seeded universe refuses
 * edits, and a member that is not in reference data is a 422. A stub that
 * accepted anything would let the client's error paths pass untested, which
 * is the half of BU-78 most likely to be wrong.
 */
function writeUniverse(
  method: string,
  path: string,
  parsed: Record<string, unknown>
): { status: number; payload: unknown } {
  const name = typeof parsed.name === 'string' ? parsed.name : ''
  const identifiers = Array.isArray(parsed.identifiers) ? (parsed.identifiers as string[]) : []
  const description = typeof parsed.description === 'string' ? parsed.description : null

  const unknown = identifiers.filter((identifier) => !KNOWN.has(identifier))
  if (unknown.length > 0) {
    return {
      status: 422,
      payload: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `not in reference data: ${unknown.join(', ')}`
        }
      }
    }
  }

  if (method === 'POST') {
    if (name.trim() === '' || identifiers.length === 0) {
      return {
        status: 422,
        payload: {
          error: { code: 'VALIDATION_ERROR', message: 'a universe needs a name and members' }
        }
      }
    }
    const created: StubUniverse = {
      id: deriveId(name),
      name,
      description,
      identifiers,
      source: 'user'
    }
    universes = [...universes, created]
    return { status: 201, payload: created }
  }

  const id = path.slice('/universes/'.length)
  const found = universes.find((universe) => universe.id === id)
  if (found === undefined) {
    return { status: 404, payload: { error: { code: 'NOT_FOUND', message: `no universe ${id}` } } }
  }
  if (found.source === 'seeded') {
    return {
      status: 422,
      payload: {
        error: { code: 'VALIDATION_ERROR', message: 'a seeded universe cannot be edited' }
      }
    }
  }

  const updated: StubUniverse = { ...found, name, description, identifiers }
  universes = universes.map((universe) => (universe.id === id ? updated : universe))
  return { status: 200, payload: updated }
}

export function startStubEngine(): Promise<StubEngine> {
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')

    // The app's origin is `beacon://app` when packaged and served from the
    // app scheme; allow it so the stub does not reintroduce the problem
    // BN-122 removed.
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('access-control-allow-headers', 'authorization, content-type')
    // DELETE is preflighted, and a preflight that does not name it fails the
    // request before the stub ever sees it (BU-144).
    response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.setHeader('content-type', 'application/json')

    if (request.method === 'OPTIONS') {
      response.writeHead(200).end()
      return
    }

    const method = request.method ?? 'GET'

    /*
     * Submitting a backtest (BU-137).
     *
     * 202 with a job, as the engine answers — and the job is finished on
     * arrival, since this stub carries no event socket to push progress
     * over. Whether a benchmark was asked for decides whether the result
     * measures one, which is the distinction the client has to keep.
     */
    if (method === 'POST' && /^\/beacon\/[^/]+\/backtest$/.test(url.pathname)) {
      let raw = ''
      request.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf-8')
      })
      request.on('end', () => {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(raw === '' ? '{}' : raw) as Record<string, unknown>
        } catch {
          parsed = {}
        }

        const jobId = `job-${String(jobs.size + 1)}`
        jobs.set(jobId, {
          job_id: jobId,
          kind: 'backtest',
          status: 'succeeded',
          progress: 1,
          message: 'done',
          result: backtestResult(parsed.benchmark !== undefined && parsed.benchmark !== null),
          error: null
        })

        response.writeHead(202).end(
          JSON.stringify({
            job_id: jobId,
            kind: 'backtest',
            status: 'succeeded',
            progress: 1,
            message: 'done',
            error: null
          })
        )
      })
      return
    }

    /*
     * Deleting a universe (BU-144).
     *
     * The engine refuses a seeded one, and so does this: a client that only
     * ever hides the button would pass a test against a stub that accepted
     * the call anyway.
     */
    if (method === 'DELETE' && url.pathname.startsWith('/universes/')) {
      const id = decodeURIComponent(url.pathname.slice('/universes/'.length))
      const universe = universes.find((entry) => entry.id === id)

      if (universe === undefined) {
        response
          .writeHead(404)
          .end(JSON.stringify(notFound(`universe '${id}'`, 'DocumentStore').payload))
        return
      }
      if (universe.source === 'seeded') {
        response.writeHead(422).end(
          JSON.stringify({
            error: { code: 'VALIDATION_ERROR', message: 'a seeded universe cannot be deleted' }
          })
        )
        return
      }

      universes = universes.filter((entry) => entry.id !== id)
      response.writeHead(204).end()
      return
    }

    const writesUniverse =
      (method === 'POST' && url.pathname === '/universes') ||
      (method === 'PUT' && url.pathname.startsWith('/universes/'))

    if (writesUniverse) {
      let raw = ''
      request.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf-8')
      })
      request.on('end', () => {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(raw === '' ? '{}' : raw) as Record<string, unknown>
        } catch {
          parsed = {}
        }
        const result = writeUniverse(method, url.pathname, parsed)
        response.writeHead(result.status).end(JSON.stringify(result.payload))
      })
      return
    }

    const payload = body(url)

    /*
     * A refusal carries its own status (BU-88).
     *
     * Everything unhandled used to flatten to 404, so a 422 the engine
     * returns — an unknown reference column, an id that cannot address a
     * document — arrived here as "not found". The client branches on status
     * and on `code`, so collapsing them made two different failures
     * indistinguishable and let both ship.
     */
    if (isRefusal(payload)) {
      response.writeHead(payload.status).end(JSON.stringify(payload.payload))
      return
    }

    if (payload === undefined) {
      // py-beacon's envelope, not a bare detail — the client branches on
      // `code` and renders `message`.
      response.writeHead(404).end(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: `no data for ${url.pathname.split('/').pop() ?? ''}`
          }
        })
      )
      return
    }
    response.writeHead(200).end(JSON.stringify(payload))
  })

  /*
   * Upgraded sockets have to be tracked by hand.
   *
   * Once `upgrade` has a listener, Node hands the socket over and stops
   * counting it as one of the server's connections — so `closeAllConnections`
   * does not touch it and `server.close` waits on it forever. That is a
   * 60-second teardown timeout on every single test, with the assertions
   * having already passed.
   */
  const upgraded = new Set<Duplex>()
  server.on('upgrade', (request, socket) => {
    if (!acceptSocket(request, socket)) return
    upgraded.add(socket)
    socket.on('close', () => upgraded.delete(socket))
  })

  return new Promise((resolve) => {
    // Port 0: the OS picks, so two runs never collide.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${String(port)}`,
        close: () =>
          new Promise((done) => {
            for (const socket of upgraded) socket.destroy()
            upgraded.clear()
            server.closeAllConnections()
            server.close(() => {
              done()
            })
          })
      })
    })
  })
}
