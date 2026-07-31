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
}

/**
 * Candidate interpreters, most specific first.
 *
 * A bundled runtime lands in BU-33 and will take priority ahead of the
 * sibling checkout; until then development relies on py-beacon's own venv,
 * which is where the `beacon` package and its server extra actually live.
 * Falling straight through to `python` on PATH would find an interpreter
 * without fastapi and fail confusingly at import time.
 */
export function pythonCandidates(options: LocateOptions = {}): string[] {
  const { override, appRoot = process.cwd() } = options
  if (override !== undefined && override !== '') return [override]

  const siblings = [resolve(appRoot, '..', 'py-beacon'), resolve(appRoot, '..', 'py_beacon')]

  return [
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
