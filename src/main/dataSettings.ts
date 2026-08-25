import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { DataSettings } from '@shared/ipc'

const SETTINGS_FILE = 'data-settings.json'
const MARKER_FILE = 'store-provenance.json'

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

/**
 * What this app generated, and with what (BU-89).
 *
 * `shouldGenerate` refuses to touch an existing store, and must keep
 * refusing: py-beacon auto-loads whatever sits at the app-data path, so a
 * wrong `true` does not fail, it replaces someone's real data. The cost of
 * that rule is that a store generated before a py-beacon change keeps
 * producing the old shape forever, silently. Two real cases: a store made
 * before BN-128 has no REGION or COUNTRY columns, and one made before the
 * `--assets` fix holds 512 names rather than 5,000.
 *
 * A marker breaks the tie. A store this app wrote is not the user's data and
 * can be offered for replacement; a store with NO marker is not ours and is
 * left alone exactly as before.
 */
export interface StoreProvenance {
  /** py-beacon's version at the time it was generated. */
  engineVersion: string
  /** The CLI arguments used, so a change in them is detectable. */
  args: string[]
  /** ISO 8601. */
  generatedAt: string
}

function markerPath(): string {
  return join(app.getPath('userData'), MARKER_FILE)
}

export function readProvenance(): StoreProvenance | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(markerPath(), 'utf-8'))
    if (typeof raw !== 'object' || raw === null) return undefined
    const record = raw as Record<string, unknown>
    if (typeof record.engineVersion !== 'string') return undefined

    return {
      engineVersion: record.engineVersion,
      args: Array.isArray(record.args) ? record.args.map(String) : [],
      generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : ''
    }
  } catch {
    return undefined
  }
}

export function writeProvenance(provenance: StoreProvenance): void {
  try {
    writeFileSync(markerPath(), JSON.stringify(provenance, null, 2), 'utf-8')
  } catch {
    // Losing the marker costs a stale-store prompt, not the app.
  }
}

/**
 * Whether the store this app generated is behind what it would generate now.
 *
 * Deliberately NOT a guess about the data itself — nothing here inspects
 * columns or row counts, because "what a store should contain" is py-beacon's
 * question. It compares what was recorded at generation time against what
 * this build would produce, which is a fact both ends of.
 *
 * Undefined means no opinion: no marker, so the store is not ours to judge.
 */
export function staleReason(
  provenance: StoreProvenance | undefined,
  engineVersion: string | undefined,
  args: readonly string[]
): string | undefined {
  if (provenance === undefined || engineVersion === undefined) return undefined

  // An empty recorded version is "not known yet", not a mismatch: the marker
  // is written when generation finishes, which is before any server has been
  // asked its version, and stamped on the first connect after that. A launch
  // interrupted in between must not read as stale forever.
  if (provenance.engineVersion !== '' && provenance.engineVersion !== engineVersion) {
    return `generated with py-beacon ${provenance.engineVersion}, and ${engineVersion} is running now`
  }

  if (provenance.args.join(' ') !== args.join(' ')) {
    return 'generated with different options from the ones this build would use'
  }

  return undefined
}
