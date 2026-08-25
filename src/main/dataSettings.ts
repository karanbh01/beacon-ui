import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { DataSettings } from '@shared/ipc'

const SETTINGS_FILE = 'data-settings.json'

export const DEFAULT_SETTINGS: DataSettings = { storePath: '', synthetic: true }

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

/** Anything unrecognised falls back, so a hand-edited file cannot break start-up. */
export function parseSettings(raw: unknown): DataSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS
  const record = raw as Record<string, unknown>

  return {
    storePath: typeof record.storePath === 'string' ? record.storePath : '',
    synthetic: typeof record.synthetic === 'boolean' ? record.synthetic : true
  }
}

export function readSettings(): DataSettings {
  try {
    return parseSettings(JSON.parse(readFileSync(settingsPath(), 'utf-8')))
  } catch {
    // Missing on first launch, or corrupt. Either way: defaults.
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(settings: DataSettings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch {
    // Not fatal: the app runs on whatever is in memory, and refusing to start
    // because a preferences file would not write would be worse than losing
    // the preference.
  }
}

/**
 * The environment the engine is spawned with (BU-111).
 *
 * **The real environment wins.** `BEACON_DATA_PATH` set outside the app is
 * somebody pointing a specific run at a specific store — from a terminal, a
 * launcher, a CI job — and a saved preference must not quietly override the
 * thing they typed a second ago. The settings window is a way to set these
 * for people who never open a terminal, not a way to outrank one.
 */
export function environmentFor(settings: DataSettings, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }

  if ((base.BEACON_DATA_PATH ?? '').trim() === '' && settings.storePath.trim() !== '') {
    env.BEACON_DATA_PATH = settings.storePath.trim()
  }

  if ((base.BEACON_NO_SYNTHETIC ?? '').trim() === '' && !settings.synthetic) {
    env.BEACON_NO_SYNTHETIC = '1'
  }

  return env
}
