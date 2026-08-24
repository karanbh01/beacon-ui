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
 * Fixed, because every assertion below is written against these.
 *
 * A `TableFrame` — index / columns / data — not a list of bar objects. That
 * is what py-beacon puts on the wire (a pandas frame, row-oriented) and the
 * distinction is not cosmetic: `summarise` resolves its columns by name off
 * `columns`, so a stub that served `{ bars: [...] }` renders an empty table
 * with no error anywhere.
 */
const PRICE_COLUMNS = ['open', 'high', 'low', 'close', 'volume']
const PRICES = {
  index: Array.from({ length: 240 }, (_, i) =>
    new Date(Date.UTC(2025, 0, 6 + i)).toISOString().slice(0, 10)
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
    fields: {
      date_from: listedFrom(index),
      name: `${identifier} Corporation`,
      gics_sector: ['Information Technology', 'Financials', 'Health Care'][index % 3],
      gics_sub_industry: 'Application Software',
      free_float_market_cap: 3.16e12 - index * 1.1e10,
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
  '/indices': { indices: [indexDocument('TECH10')] },
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
    const id = path.slice('/indices/'.length)
    return id === '' || id.includes('/') ? undefined : indexDocument(decodeURIComponent(id))
  }

  if (path.startsWith('/data/prices/')) {
    // Unknown identifiers 404 rather than serving bars for anything asked
    // for. Without this no test could tell a real ticker from a typo, which
    // is the whole point of the not-found path.
    const identifier = path.split('/').pop() ?? ''
    if (!KNOWN.has(identifier) || identifier === REFERENCE_ONLY) return undefined

    // Echo the interval asked for (BU-106). It was hard-coded 'native', so a
    // client that never sent the parameter looked identical to one that did.
    const interval = url.searchParams.get('interval') ?? 'native'

    // `adjusted` ADDS a column rather than replacing one (BN-146), so a client
    // that never sends it must see no ADJ_CLOSE at all.
    const adjusted = url.searchParams.get('adjusted') === 'true'
    const prices = adjusted
      ? {
          ...PRICES,
          columns: [...PRICES.columns, 'ADJ_CLOSE'],
          data: PRICES.data.map((row) => [...row, Number(row[3]) * 0.97])
        }
      : PRICES

    return { identifier, interval, prices }
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
    return { identifier: path.split('/').pop(), fields: referenceEntry('CMP000', 0).fields }
  }

  if (path.startsWith('/data/corporate-actions/')) {
    return {
      identifier: path.split('/').pop(),
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

  if (path === '/universes') return { universes }

  if (path.endsWith('/members') && path.startsWith('/universes/')) {
    const id = path.slice('/universes/'.length, -'/members'.length)
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
    response.setHeader('content-type', 'application/json')

    if (request.method === 'OPTIONS') {
      response.writeHead(200).end()
      return
    }

    const method = request.method ?? 'GET'
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
