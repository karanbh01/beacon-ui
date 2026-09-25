import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * What an older build saved about data, kept only to be handed over (BU-215).
 *
 * Until py-beacon 0.1.2 this app owned the store: a location saved here was
 * passed to the engine as `BEACON_DATA_PATH` (BU-111), and a marker beside it
 * recorded what this app had generated (BU-89). The engine keeps a registry
 * of stores now, and `BEACON_DATA_PATH` outranks the registry on every start
 * — so passing a saved location on would pin the engine to it forever and
 * make Use in the sources dialog undo itself at the next launch.
 *
 * Instead the location is read once, registered with the engine, and these
 * files are removed. Nothing here is written any more.
 */
const SETTINGS_FILE = 'data-settings.json'
const MARKER_FILE = 'store-provenance.json'

function inUserData(file: string): string {
  return join(app.getPath('userData'), file)
}

/** The saved location in a settings file's contents, or '' for none. */
export function savedStorePathOf(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return ''
  const storePath = (raw as Record<string, unknown>).storePath
  return typeof storePath === 'string' ? storePath.trim() : ''
}

export function readSavedStorePath(): string {
  try {
    return savedStorePathOf(JSON.parse(readFileSync(inUserData(SETTINGS_FILE), 'utf-8')))
  } catch {
    // Missing, which is every install since BU-215, or corrupt. Either way
    // there is nothing to hand over.
    return ''
  }
}

/** Remove what the old model left, once the engine has what it needs. */
export function forgetSavedSettings(): void {
  for (const file of [SETTINGS_FILE, MARKER_FILE]) {
    rmSync(inUserData(file), { force: true })
  }
}
