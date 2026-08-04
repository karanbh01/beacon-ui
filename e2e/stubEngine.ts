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

function referenceEntry(identifier: string, index: number): Record<string, unknown> {
  return {
    identifier,
    found: true,
    fields: {
      name: `${identifier} Corporation`,
      gics_sector: ['Information Technology', 'Financials', 'Health Care'][index % 3],
      gics_sub_industry: 'Application Software',
      free_float_market_cap: 3.16e12 - index * 1.1e10,
      adv_3m: 4_182_000 - index * 9_000
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
  '/indices': { indices: [{ id: 'TECH10', name: 'Beacon US Technology Top 10' }] },
  '/universes': { universes: [{ id: 'US-LARGECAP', name: 'US Large Cap' }] },
  '/data/watchlists': { watchlists: [] }
}

function body(url: URL): unknown {
  const path = url.pathname

  if (Object.hasOwn(ROUTES, path)) return ROUTES[path]

  if (path.startsWith('/data/prices/')) {
    return { identifier: path.split('/').pop(), interval: 'native', prices: PRICES }
  }

  if (path === '/data/reference') {
    const wanted = url.searchParams.getAll('identifiers').flatMap((value) => value.split(','))
    const ids = wanted.length > 0 ? wanted : IDENTIFIERS
    return { as_of: '2026-08-04', entries: ids.map(referenceEntry) }
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

  if (path === '/universes/US-LARGECAP/members') {
    return { universe_id: 'US-LARGECAP', identifiers: IDENTIFIERS }
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

export function startStubEngine(): Promise<StubEngine> {
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const payload = body(url)

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
    if (payload === undefined) {
      response.writeHead(404).end(JSON.stringify({ detail: `no stub for ${url.pathname}` }))
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
