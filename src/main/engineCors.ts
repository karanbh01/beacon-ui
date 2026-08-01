import { session } from 'electron'
import { APP_ORIGIN } from './appProtocol'

/**
 * Let the renderer call the engine from the app scheme.
 *
 * py-beacon binds loopback and authenticates with a bearer token; it does not
 * send CORS headers for `beacon://app`. In development the renderer is served
 * from `http://localhost:5173`, which py-beacon does allow, so this only ever
 * bites the packaged build — which is exactly why it went unnoticed until the
 * app was packaged for the first time.
 *
 * Two things have to be true for the browser to allow the call:
 *
 * 1. The response carries `Access-Control-Allow-Origin` for our origin.
 * 2. The PREFLIGHT succeeds. Every call carries an `Authorization` header,
 *    which is not a CORS-safelisted header, so Chromium sends an `OPTIONS`
 *    first. FastAPI has no OPTIONS route and answers 405, which fails the
 *    preflight however the headers are set — so the status is rewritten too.
 *
 * This is a shim, not the destination. The right fix is either CORS
 * middleware in py-beacon or proxying the engine through the app scheme so
 * there is no cross-origin call at all; the second would also keep the token
 * out of the renderer. Tracked in #48.
 */
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d+\//

export function isEngineUrl(url: string): boolean {
  return LOOPBACK.test(url)
}

/** Headers that make a preflight pass for a token-authenticated GET/POST. */
export function corsHeaders(origin: string): Record<string, string[]> {
  return {
    'access-control-allow-origin': [origin],
    'access-control-allow-methods': ['GET, POST, PUT, DELETE, OPTIONS'],
    'access-control-allow-headers': ['authorization, content-type'],
    'access-control-max-age': ['600']
  }
}

/**
 * Whether a preflight response needs its status rewritten.
 *
 * Only for OPTIONS, and only when the server refused: rewriting a real
 * failure on a real request would hide an error the user needs to see.
 */
export function shouldRewriteStatus(method: string, statusCode: number): boolean {
  return method === 'OPTIONS' && statusCode >= 400
}

export function installEngineCors(origin = APP_ORIGIN): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isEngineUrl(details.url)) {
      callback({})
      return
    }

    const responseHeaders = { ...details.responseHeaders, ...corsHeaders(origin) }

    if (shouldRewriteStatus(details.method, details.statusCode)) {
      callback({ responseHeaders, statusLine: 'HTTP/1.1 200 OK' })
      return
    }

    callback({ responseHeaders })
  })
}
