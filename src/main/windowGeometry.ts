/**
 * Pure geometry logic for window placement, kept free of Electron imports so
 * it is directly unit-testable. All Electron I/O lives in `windowState.ts`.
 */

export const DEFAULT_WIDTH = 1440
export const DEFAULT_HEIGHT = 1024
export const MIN_WIDTH = 1280
export const MIN_HEIGHT = 900

/**
 * A restored window must expose at least this much of itself on some display,
 * otherwise it is unreachable — you cannot grab a title bar you cannot see.
 * Guards against a saved position on a monitor that is no longer connected.
 */
const MIN_VISIBLE_WIDTH = 120
const MIN_VISIBLE_HEIGHT = 40

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  /** Null when there is no usable saved position, i.e. use the default. */
  bounds: Bounds | null
  maximized: boolean
}

export const DEFAULT_STATE: WindowState = { bounds: null, maximized: false }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseBounds(raw: Record<string, unknown>): Bounds | null {
  const { x, y, width, height } = raw
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/**
 * Validate whatever was on disk. A corrupt or hand-edited state file must
 * degrade to defaults rather than crash launch, so every field is checked.
 */
export function parseWindowState(raw: unknown): WindowState {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_STATE

  const record = raw as Record<string, unknown>
  const boundsRaw = record.bounds
  const maximized = record.maximized === true

  if (typeof boundsRaw !== 'object' || boundsRaw === null) {
    return { bounds: null, maximized }
  }
  return { bounds: parseBounds(boundsRaw as Record<string, unknown>), maximized }
}

function overlap(a: Bounds, b: Bounds): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width, height }
}

/** True when enough of `bounds` lands on at least one display to be usable. */
export function isReachable(bounds: Bounds, displays: readonly Bounds[]): boolean {
  return displays.some((display) => {
    const { width, height } = overlap(bounds, display)
    return width >= MIN_VISIBLE_WIDTH && height >= MIN_VISIBLE_HEIGHT
  })
}

/**
 * Resolve saved state against the displays actually present now. Returns the
 * bounds to open at, or null to let Electron place a default-sized window.
 */
export function resolveBounds(state: WindowState, displays: readonly Bounds[]): Bounds | null {
  if (state.bounds === null) return null

  const bounds: Bounds = {
    x: state.bounds.x,
    y: state.bounds.y,
    width: Math.max(state.bounds.width, MIN_WIDTH),
    height: Math.max(state.bounds.height, MIN_HEIGHT)
  }
  return isReachable(bounds, displays) ? bounds : null
}
