/**
 * The one URL check between the renderer and the OS (BU-112).
 *
 * `shell.openExternal` hands its argument to the operating system, so the
 * scheme decides whether "open a link" means a browser tab or launching a
 * program — `file:`, `ms-settings:` and friends all do something. The
 * renderer is the least trusted part of the app, so this refuses rather than
 * trusts, and lives apart from the IPC wiring so it can be tested without
 * Electron.
 */
export function externalUrl(raw: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return undefined
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
  return parsed.toString()
}
