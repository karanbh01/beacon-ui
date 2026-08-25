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
 */

interface Envelope {
  error?: { code?: string; message?: string }
}

async function get(url: string, path: string): Promise<{ status: number; body: Envelope }> {
  const response = await fetch(`${url}${path}`, {
    headers: { authorization: 'Bearer stub' }
  })
  return { status: response.status, body: (await response.json()) as Envelope }
}

test('an unknown reference column is a 422, not an invented value', async ({ engine }) => {
  // BU-85: the client asked for `name`, `gics_sector` and `market_cap`. The
  // engine rejects the whole batch; the stub used to fabricate all three, so
  // every detail column was empty against a real engine and green here.
  const { status, body } = await get(engine.url, '/data/reference?identifiers=CMP000&fields=NOPE')

  expect(status).toBe(422)
  expect(body.error?.code).toBe('INVALID_RULE')
  expect(body.error?.message).toContain('unknown reference column')
})

test('a derived field is still accepted, since the client asks for one', async ({ engine }) => {
  const response = await fetch(`${engine.url}/data/reference?identifiers=CMP000&fields=adv_3m`, {
    headers: { authorization: 'Bearer stub' }
  })
  expect(response.status).toBe(200)
})

test('an unknown identifier is a 404 in the engine’s own words', async ({ engine }) => {
  const prices = await get(engine.url, '/data/prices/ZZZNOPE')
  expect(prices.status).toBe(404)
  expect(prices.body.error?.code).toBe('DATA_NOT_FOUND')

  const reference = await get(engine.url, '/data/reference/ZZZNOPE')
  expect(reference.status).toBe(404)
  expect(reference.body.error?.code).toBe('DATA_NOT_FOUND')

  const actions = await get(engine.url, '/data/corporate-actions/ZZZNOPE')
  expect(actions.status).toBe(404)
  expect(actions.body.error?.code).toBe('DATA_NOT_FOUND')
})

test('an id that cannot address a document is a 422, not a lookup', async ({ engine }) => {
  // BU-87: the view sent its tab TITLE as an index id. The engine refuses a
  // space against `^[A-Za-z0-9_-]{1,64}$`; the stub answered anyway.
  const { status, body } = await get(engine.url, '/indices/my%20index')

  expect(status).toBe(422)
  expect(body.error?.code).toBe('VALIDATION_ERROR')
})

test('reference data answers for the identifier asked for', async ({ engine }) => {
  // BU-114: it served CMP000's fields under every name, so the view showed
  // one company's data for all of them and no test could tell.
  const response = await fetch(`${engine.url}/data/reference/CMP001`, {
    headers: { authorization: 'Bearer stub' }
  })
  const payload = (await response.json()) as { identifier: string; fields: Record<string, unknown> }

  expect(payload.identifier).toBe('CMP001')
  expect(payload.fields.name).toBe('CMP001 Corporation')
})

test('the index list returns whole documents, as the endpoint does', async ({ engine }) => {
  // BU-95: it returned `{id, name}`, and the overview crashed reading
  // `universe.universe_id` off a row the real endpoint always carries.
  const response = await fetch(`${engine.url}/indices`, {
    headers: { authorization: 'Bearer stub' }
  })
  const payload = (await response.json()) as { indices: { universe?: unknown }[] }

  expect(payload.indices[0]?.universe).toBeDefined()
})

test('the prices interval is echoed, not hard-coded', async ({ engine }) => {
  // BU-106: it always said 'native', so a client that never sent the
  // parameter was indistinguishable from one that did.
  const response = await fetch(`${engine.url}/data/prices/CMP000?interval=monthly`, {
    headers: { authorization: 'Bearer stub' }
  })
  const payload = (await response.json()) as { interval: string }

  expect(payload.interval).toBe('monthly')
})
