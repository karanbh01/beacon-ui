import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Prefix py-beacon prints once it has bound a port. */
export const PORT_PREFIX = 'BEACON_PORT='

/** Module path, not the distribution name — `py-beacon` installs as `beacon`. */
export const SERVER_MODULE = 'beacon.server'

/**
 * Read the announced port out of a chunk of the server's stdout.
 *
 * Scans for the prefix rather than reading the first line: on this machine
 * SciPy emits a NumPy-version warning before it, and py-beacon's launcher
 * explicitly documents that later lines are ordinary logging.
 */
export function parsePort(text: string): number | undefined {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(PORT_PREFIX)) continue
    const port = Number.parseInt(line.slice(PORT_PREFIX.length), 10)
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port
  }
  return undefined
}

const WINDOWS = process.platform === 'win32'

function venvPython(root: string): string {
  return WINDOWS
    ? join(root, '.venv', 'Scripts', 'python.exe')
    : join(root, '.venv', 'bin', 'python')
}

export interface LocateOptions {
  /** Overrides everything. Set BEACON_PYTHON to pin an interpreter. */
  override?: string | undefined
  /** Where to look for a sibling py-beacon checkout. */
  appRoot?: string
  exists?: (path: string) => boolean
  /**
   * The `extraResources` directory of a packaged app, if there is one.
   *
   * Only set when packaged: in development the sibling checkout is the
   * correct interpreter, because it is the py-beacon being worked on.
   */
  resourcesPath?: string | undefined
}

/** The bundled interpreter inside a packaged app's resources (ADR-0003). */
export function bundledPython(resourcesPath: string): string {
  return WINDOWS
    ? join(resourcesPath, 'python', 'python', 'python.exe')
    : join(resourcesPath, 'python', 'python', 'bin', 'python3')
}

/**
 * Candidate interpreters, most specific first.
 *
 * The bundled runtime wins when the app is packaged (ADR-0003): a shipped app
 * must not depend on what happens to be on the user's PATH. In development
 * there is no payload and the sibling checkout is correct, because it is the
 * py-beacon being worked on. Falling straight through to `python` on PATH
 * would find an interpreter without fastapi and fail confusingly at import.
 *
 * BEACON_PYTHON still beats everything, including the bundle — a developer
 * pinning an interpreter means it.
 */
export function pythonCandidates(options: LocateOptions = {}): string[] {
  const { override, appRoot = process.cwd(), resourcesPath } = options
  if (override !== undefined && override !== '') return [override]

  const siblings = [resolve(appRoot, '..', 'py-beacon'), resolve(appRoot, '..', 'py_beacon')]

  return [
    ...(resourcesPath === undefined || resourcesPath === '' ? [] : [bundledPython(resourcesPath)]),
    ...siblings.map(venvPython),
    venvPython(appRoot),
    WINDOWS ? 'python.exe' : 'python3',
    'python'
  ]
}

/**
 * First candidate that exists on disk, else the last one.
 *
 * Bare names like `python3` are returned unchecked — they are resolved
 * through PATH by the spawn itself, and testing for them here would mean
 * reimplementing PATH lookup.
 */
export function locatePython(options: LocateOptions = {}): string {
  const { exists = existsSync } = options
  const candidates = pythonCandidates(options)

  for (const candidate of candidates) {
    const isPath = candidate.includes('/') || candidate.includes('\\')
    if (!isPath) return candidate
    if (exists(candidate)) return candidate
  }
  return candidates[candidates.length - 1] ?? 'python'
}
