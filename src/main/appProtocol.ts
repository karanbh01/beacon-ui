import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { protocol, net } from 'electron'

/**
 * The origin the packaged renderer is served from.
 *
 * `file://` cannot work here for two separate reasons, and the second one is
 * the reason this file exists at all:
 *
 * 1. A `file://` document has an OPAQUE origin, so a CSP of `script-src
 *    'self'` matches nothing and the whole strict policy becomes theatre.
 * 2. **ES module scripts are fetched with CORS**, and a CORS fetch from an
 *    opaque origin always fails. The renderer bundle is a module, so under
 *    `file://` it never executes — the window opens, paints its background,
 *    and stays blank with no error the user can see.
 *
 * A registered standard scheme gives a real, stable origin, so modules load
 * and `'self'` means something.
 */
export const APP_SCHEME = 'beacon'
export const APP_ORIGIN = `${APP_SCHEME}://app`

/**
 * Must be called before `app.whenReady()`.
 *
 * `standard` is what gives the scheme an origin; `secure` puts it in a secure
 * context so the platform APIs a modern renderer expects are available;
 * `supportFetchAPI` lets the bundle's own fetches resolve against it.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json'
}

/**
 * Resolve a request path to a file inside `root`, or nothing.
 *
 * Exported for tests. The traversal check is the point: a URL is attacker-
 * reachable in principle, and `beacon://app/../../../etc/passwd` must not
 * resolve outside the bundle.
 */
export function resolveAsset(root: string, pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, '')
  const target = normalize(join(root, decoded === '' ? 'index.html' : decoded))
  const base = resolve(root)
  return target === base || target.startsWith(base + sep) ? target : undefined
}

export function contentType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** Serve the built renderer from `root` on the app scheme. */
export function serveRenderer(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const path = resolveAsset(root, new URL(request.url).pathname)
    if (path === undefined) return new Response('Not found', { status: 404 })

    try {
      const info = await stat(path)
      if (!info.isFile()) return new Response('Not found', { status: 404 })
    } catch {
      // A client-side route that is not a real file still has to boot the
      // app, so an unknown path falls back to the document.
      return net.fetch(`${APP_ORIGIN}/index.html`)
    }

    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { 'content-type': contentType(path) }
    })
  })
}
