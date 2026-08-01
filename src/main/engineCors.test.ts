import { describe, expect, it } from 'vitest'
import { corsHeaders, isEngineUrl, shouldRewriteStatus } from './engineCors'

describe('isEngineUrl', () => {
  it('matches the loopback engine on any port', () => {
    expect(isEngineUrl('http://127.0.0.1:55113/health')).toBe(true)
    expect(isEngineUrl('http://127.0.0.1:9/data/coverage')).toBe(true)
  })

  it('does not match anything else', () => {
    // The shim must not relax CORS for the whole session — only for the
    // server this app started and owns.
    expect(isEngineUrl('https://example.com/')).toBe(false)
    expect(isEngineUrl('http://127.0.0.2:8000/')).toBe(false)
    expect(isEngineUrl('http://localhost:8000/')).toBe(false)
    expect(isEngineUrl('beacon://app/index.html')).toBe(false)
  })
})

describe('corsHeaders', () => {
  it('names our origin exactly, never a wildcard', () => {
    // `*` is invalid with credentials anyway, and would relax the policy
    // beyond the one origin that needs it.
    expect(corsHeaders('beacon://app')['access-control-allow-origin']).toEqual(['beacon://app'])
  })

  it('allows the Authorization header, which is what forces the preflight', () => {
    expect(corsHeaders('beacon://app')['access-control-allow-headers']?.[0]).toContain(
      'authorization'
    )
  })
})

describe('shouldRewriteStatus', () => {
  it('rescues a preflight the server has no route for', () => {
    // FastAPI answers 405 to OPTIONS on a GET-only route, and a failed
    // preflight blocks the real request however the headers are set.
    expect(shouldRewriteStatus('OPTIONS', 405)).toBe(true)
  })

  it('never rewrites a real request', () => {
    // A 404 or a 500 on an actual call is something the user must see.
    expect(shouldRewriteStatus('GET', 404)).toBe(false)
    expect(shouldRewriteStatus('POST', 500)).toBe(false)
  })

  it('leaves a preflight the server already accepted alone', () => {
    expect(shouldRewriteStatus('OPTIONS', 200)).toBe(false)
  })
})
