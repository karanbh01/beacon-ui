import { describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, createClient } from './client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/** A fetch stub that records its calls, typed so no cast is needed. */
function mockFetch(respond: () => Promise<Response>) {
  return vi.fn<typeof fetch>(() => respond())
}

function client(fetchImpl: typeof fetch) {
  return createClient({ baseUrl: 'http://127.0.0.1:9999/', token: 'tok', fetchImpl })
}

describe('request shape', () => {
  it('sends the bearer token on every call', async () => {
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({ status: 'ok' })))
    await client(fetchImpl).health()

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('expands path parameters and encodes them', async () => {
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({})))
    await client(fetchImpl).data.prices('BRK.B')

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toBe('http://127.0.0.1:9999/data/prices/BRK.B')
  })

  it('strips a trailing slash from the base url rather than doubling it', async () => {
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({})))
    await client(fetchImpl).data.prices('AAPL')

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).not.toContain('//data')
  })

  it('appends query parameters, skipping null', async () => {
    // py-beacon models optional query params as `string | null`, so the
    // generated types make null — not undefined — the way to omit one.
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({})))
    await client(fetchImpl).data.prices('AAPL', {
      start: '2026-01-01',
      end: null
    })

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('start=2026-01-01')
    expect(url).not.toContain('end=')
  })

  it('repeats a key for array parameters rather than comma-joining', async () => {
    // FastAPI parses repeated keys as a list; `columns=open,close` would
    // arrive as one string named "open,close".
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({})))
    await client(fetchImpl).data.prices('AAPL', {
      columns: ['open', 'close']
    })

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('columns=open&columns=close')
  })
})

describe('error mapping', () => {
  it('unwraps the error envelope into an ApiError', async () => {
    const envelope = {
      error: {
        code: 'data_not_found',
        message: 'No prices for ZZZZ',
        detail: { identifier: 'ZZZZ' }
      }
    }
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse(envelope, 404)))

    await expect(client(fetchImpl).data.prices('ZZZZ')).rejects.toThrow(ApiError)

    try {
      await client(fetchImpl).data.prices('ZZZZ')
    } catch (error) {
      const api = error as ApiError
      expect(api.code).toBe('data_not_found')
      expect(api.message).toBe('No prices for ZZZZ')
      expect(api.detail).toEqual({ identifier: 'ZZZZ' })
      expect(api.isNotFound).toBe(true)
    }
  })

  it('classifies auth and unavailable', async () => {
    const make = (status: number, code: string) =>
      mockFetch(() => Promise.resolve(jsonResponse({ error: { code, message: 'x' } }, status)))

    try {
      await client(make(401, 'unauthorised')).health()
    } catch (error) {
      expect((error as ApiError).isAuth).toBe(true)
    }
    try {
      await client(make(503, 'dependency_missing')).health()
    } catch (error) {
      expect((error as ApiError).isUnavailable).toBe(true)
    }
  })

  it('survives a non-envelope body, e.g. HTML from a proxy', async () => {
    // Throwing a JSON parse error here would hide the real status behind an
    // unrelated failure.
    const fetchImpl = mockFetch(() =>
      Promise.resolve(new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }))
    )

    try {
      await client(fetchImpl).health()
      expect.unreachable('should have thrown')
    } catch (error) {
      const api = error as ApiError
      expect(api).toBeInstanceOf(ApiError)
      expect(api.status).toBe(502)
      expect(api.code).toBe('http_502')
    }
  })

  it('reports an unreachable engine as NetworkError, not a raw TypeError', async () => {
    const fetchImpl = mockFetch(() => Promise.reject(new TypeError('fetch failed')))

    await expect(client(fetchImpl).health()).rejects.toThrow(NetworkError)
  })
})

describe('typed responses', () => {
  it('returns the parsed body', async () => {
    const body = { identifier: 'AAPL', interval: '1d', prices: [] }
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse(body)))

    const result = await client(fetchImpl).data.prices('AAPL')

    expect(result.identifier).toBe('AAPL')
    expect(result.interval).toBe('1d')
  })
})
