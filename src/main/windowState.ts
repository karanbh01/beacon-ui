import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen, type BrowserWindow } from 'electron'
import {
  DEFAULT_STATE,
  parseWindowState,
  resolveBounds,
  type Bounds,
  type WindowState
} from './windowGeometry'

const STATE_FILE = 'window-state.json'

/** Coalesce the burst of resize/move events a single drag produces. */
const SAVE_DEBOUNCE_MS = 400

function stateFilePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

function readState(): WindowState {
  try {
    return parseWindowState(JSON.parse(readFileSync(stateFilePath(), 'utf-8')))
  } catch {
    // Missing on first launch, or corrupt. Either way: defaults.
    return DEFAULT_STATE
  }
}

function writeState(state: WindowState): void {
  try {
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // Persisting geometry is a convenience; never let it break quit.
  }
}

function displayBounds(): Bounds[] {
  return screen.getAllDisplays().map((display) => display.workArea)
}

/** Saved bounds for the next launch, or null if they are no longer usable. */
export function restoredBounds(): Bounds | null {
  return resolveBounds(readState(), displayBounds())
}

export function wasMaximized(): boolean {
  return readState().maximized
}

function captureState(window: BrowserWindow): WindowState {
  const maximized = window.isMaximized()
  // getNormalBounds() reports the pre-maximise rectangle, so restoring from a
  // maximised window does not collapse it to full-screen dimensions.
  return { bounds: window.getNormalBounds(), maximized }
}

/**
 * Persist geometry as the user moves, resizes and maximises. Saves on close
 * too, since the debounce may not have fired for the last movement.
 */
export function persistWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const scheduleSave = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      writeState(captureState(window))
    }, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)

  window.on('close', () => {
    if (timer !== undefined) clearTimeout(timer)
    writeState(captureState(window))
  })
}
