import { expect, test } from './fixtures'

/**
 * The fake engine must refuse what the real one refuses (BU-88).
 *
 * Every expectation here was probed against a running py-beacon, not
 * imagined. The point is narrow and worth stating plainly: a stub that is
 * MORE GENEROUS than the engine makes a test pass and ships the failure to
 * the user. Four bugs reached Karan exactly that way.
 *
 * These talk to the stub over HTTP rather than through the app, because the
 * app is now correct — driving it would prove the client behaves, not that
 * the fake still bites.
 *
 * **Run this file against a live py-beacon** and every claim below is
 * checked against the thing it mirrors rather than against itself:
 *
 *     BEACON_LIVE_URL=http://127.0.0.1:8765  *     BEACON_API_TOKEN=...  *     BEACON_LIVE_INDEX=MYIDX BEACON_LIVE_IDENTIFIER=AAPL  *     pnpm run e2e:fidelity
 *
 * Karan chose that over validating the stub against the published schemas,
 * because all four of our stub-fidelity failures were schema-VALID payloads
 * describing behaviour the engine no longer had: a field set on every row
 * that the engine sets on few, a timestamp where a date had arrived, a
 * fallback that had been removed. Shape was never what drifted.
 *
 * Only this file is meaningful live. Every other spec asserts fixture
 * VALUES, which a real store does not have.
 */

/** A name the store carries, and an index it holds a definition for. */
const IDENTIFIER = process.env.BEACON_LIVE_IDENTIFIER ?? 'CMP000'
const INDEX = process.env.BEACON_LIVE_INDEX ?? 'TECH10'

interface Envelope {
  error?: { code?: string; message?: string }
}

function headers(token: string): Record<string, string> {
  return { authorization: `Bearer ${token === '' ? 'stub' : token}` }
}

async function get(
  engine: { url: string; token: string },
  path: string
): Promise<{ status: number; body: Envelope }> {
  const response = await fetch(`${engine.url}${path}`, { headers: headers(engine.token) })
  return { status: response.status, body: (await response.json()) as Envelope }
}

test('an unknown reference column is a 422, not an invented value', async ({ engine }) => {
  // BU-85: the client asked for `name`, `gics_sector` and `market_cap`. The
  // engine rejects the whole batch; the stub used to fabricate all three, so
  // every detail column was empty against a real engine and green here.
  const { status, body } = await get(
    engine,
    `/data/reference?identifiers=${IDENTIFIER}&fields=NOPE`
  )

  expect(status).toBe(422)
  expect(body.error?.code).toBe('INVALID_RULE')
  expect(body.error?.message).toContain('unknown reference column')
})

test('a derived field is still accepted, since the client asks for one', async ({ engine }) => {
  const response = await fetch(
    `${engine.url}/data/reference?identifiers=${IDENTIFIER}&fields=adv_3m`,
    {
      headers: headers(engine.token)
    }
  )
  expect(response.status).toBe(200)
})

test('an unknown identifier is a 404 in the engine’s own words', async ({ engine }) => {
  const prices = await get(engine, '/data/prices/ZZZNOPE')
  expect(prices.status).toBe(404)
  expect(prices.body.error?.code).toBe('DATA_NOT_FOUND')

  const reference = await get(engine, '/data/reference/ZZZNOPE')
  expect(reference.status).toBe(404)
  expect(reference.body.error?.code).toBe('DATA_NOT_FOUND')

  const actions = await get(engine, '/data/corporate-actions/ZZZNOPE')
  expect(actions.status).toBe(404)
  expect(actions.body.error?.code).toBe('DATA_NOT_FOUND')
})

test('an id that cannot address a document is a 422, not a lookup', async ({ engine }) => {
  // BU-87: the view sent its tab TITLE as an index id. The engine refuses a
  // space against `^[A-Za-z0-9_-]{1,64}$`; the stub answered anyway.
  const { status, body } = await get(engine, '/indices/my%20index')

  expect(status).toBe(422)
  expect(body.error?.code).toBe('VALIDATION_ERROR')
})

test('reference data answers for the identifier asked for', async ({ engine }) => {
  // BU-114: it served one instrument's fields under every name, so the view
  // showed one company's data for all of them and no test could tell.
  const response = await fetch(`${engine.url}/data/reference/${IDENTIFIER}`, {
    headers: headers(engine.token)
  })
  const payload = (await response.json()) as { identifier: string; fields: Record<string, unknown> }

  // The identifier, not a name: a real store's names are its own, and the
  // claim here is that the row belongs to what was asked for.
  expect(payload.identifier).toBe(IDENTIFIER)
  expect(payload.fields.name).toBeDefined()
})

test('the index list returns whole documents, as the endpoint does', async ({ engine }) => {
  // BU-95: it returned `{id, name}`, and the overview crashed reading
  // `universe.universe_id` off a row the real endpoint always carries.
  const response = await fetch(`${engine.url}/indices`, {
    headers: headers(engine.token)
  })
  const payload = (await response.json()) as { indices: { universe?: unknown }[] }

  expect(payload.indices[0]?.universe).toBeDefined()
})

test('the prices interval is echoed, not hard-coded', async ({ engine }) => {
  // BU-106: it always said 'native', so a client that never sent the
  // parameter was indistinguishable from one that did.
  const response = await fetch(`${engine.url}/data/prices/${IDENTIFIER}?interval=monthly`, {
    headers: headers(engine.token)
  })
  const payload = (await response.json()) as { interval: string }

  expect(payload.interval).toBe('monthly')
})

test('the overview carries dates, while its level series carries moments', async ({ engine }) => {
  /*
   * BN-187. `OverviewView.start`/`.end` changed from `2023-01-02T00:00:00`
   * to `2023-01-02`, matching `CompareView` next door — the engine slices
   * its own index there (`str(level.index[0])[:10]`) while the SERIES keeps
   * its timestamps. So one payload carries both forms deliberately.
   *
   * A stub that sent timestamps for both would let a client parse the wrong
   * one and pass here, which is the shape of every fidelity bug BU-88
   * catalogued.
   */
  const { body } = await get(engine, `/beacon/${INDEX}/overview`)
  const overview = body as unknown as {
    start: string
    end: string
    last_rebalance: string
    level: { index: string[] }
  }

  expect(overview.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(overview.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  // A snapshot's own date, which was never a timestamp.
  expect(overview.last_rebalance).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  // And the series is unchanged, which is the half that makes this a trap.
  expect(overview.level.index[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})

test('the schedule answers with the whole history when asked for it', async ({ engine }) => {
  const { status, body } = await get(engine, `/indices/${INDEX}/schedule?limit=512`)
  const view = body as unknown as {
    recent: string[]
    recent_total: number
    upcoming: string[]
    upcoming_total: number
  }

  expect(status).toBe(200)
  expect(view.recent.length).toBe(view.recent_total)
  expect(view.recent.length).toBeGreaterThan(20)

  /*
   * The lookahead is a SEPARATE bound from the trim (BN-195). Raising
   * `limit` buys more history and cannot produce further future dates — a
   * stub that extended both would let a client believe otherwise and pass.
   */
  const strip = await get(engine, `/indices/${INDEX}/schedule`)
  const four = strip.body as unknown as { recent: string[]; upcoming_total: number }
  expect(four.recent).toHaveLength(4)
  expect(view.upcoming_total).toBe(four.upcoming_total)
})

test('a seeded universe refuses an edit as a conflict, not as bad input', async ({ engine }) => {
  /*
   * py-beacon 0.1.0 (BN-131). 409 CONFLICT, where it was 422 — and this stub
   * never matched the 422 either, answering VALIDATION_ERROR where the engine
   * said INVALID_RULE. Nothing in the REQUEST is wrong: the same body is
   * accepted against any other id. The target's state refuses, which is what
   * 409 says, and "failed validation" sent a client looking at its own input.
   */
  const response = await fetch(`${engine.url}/universes/GLOBAL`, {
    method: 'DELETE',
    headers: headers(engine.token)
  })
  const body = (await response.json()) as Envelope

  expect(response.status).toBe(409)
  expect(body.error?.code).toBe('CONFLICT')
  // And the remedy, since a refusal that does not say what to do instead is
  // half an answer.
  expect(body.error?.message).toContain('POST /universes')
})
