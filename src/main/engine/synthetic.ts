import { execFile } from 'node:child_process'
import { spawn } from 'node:child_process'

/** py-beacon's own CLI, so the flags stay its business rather than ours. */
export const SYNTHETIC_MODULE = 'beacon.synthetic'

/**
 * Matches the universe size the Figma frames quote, and the size at which the
 * per-name reference fan-out (#45) is visible rather than theoretical.
 */
export const SYNTHETIC_ASSETS = 512

/**
 * Pinned, so two machines and two runs see identical data.
 *
 * BU-35's screenshot diffs need that, and it removes one more place for
 * "works on mine" to hide. Changing it should be a deliberate edit.
 */
export const SYNTHETIC_SEED = 42

/** Generation is not instant at 512 assets; well short of hanging, though. */
const GENERATE_TIMEOUT_MS = 180_000

const PROBE_TIMEOUT_MS = 20_000

export interface StoreStatus {
  path: string
  exists: boolean
}

/**
 * Ask py-beacon where its store lives and whether one is there.
 *
 * Deliberately a python call rather than a reimplementation. The location is
 * `platformdirs.user_data_dir` under the hood, and a second copy of that
 * platform logic in Node would be one more thing to drift — and would be
 * wrong in a way that is invisible until the server auto-loads nothing.
 */
export function readStoreStatus(python: string): Promise<StoreStatus> {
  const script = [
    'from beacon.data import store',
    'p = store.default_path()',
    'print(p)',
    'print("1" if store.exists(p) else "0")'
  ].join('; ')

  return new Promise((resolve, reject) => {
    execFile(python, ['-c', script], { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      // `ExecFileException` is an Error at runtime but not by its type, and
      // the lint rule is right to insist on one rather than take it on trust.
      if (error !== null) {
        reject(new Error(error.message))
        return
      }
      const [path = '', flag = ''] = stdout.trim().split(/\r?\n/)
      resolve({ path, exists: flag.trim() === '1' })
    })
  })
}

export interface GenerateOptions {
  assets?: number
  seed?: number
  onLog?: (line: string) => void
}

/**
 * Generate a synthetic store where the server auto-loads it.
 *
 * No `--out`: py-beacon's CLI already defaults to the app-data path its own
 * server reads, and naming it here would mean this module deciding something
 * the two of them already agree on.
 *
 * The date window is left to the CLI too. It defaults to the five years
 * ending today rather than the library's fixed span, because demo data that
 * stopped eighteen months ago reads as stale in every freshness indicator in
 * the app — a true statement about the data and a misleading one about us.
 */
export function generateSynthetic(python: string, options: GenerateOptions = {}): Promise<void> {
  const args = [
    '-m',
    SYNTHETIC_MODULE,
    '--assets',
    String(options.assets ?? SYNTHETIC_ASSETS),
    '--seed',
    String(options.seed ?? SYNTHETIC_SEED)
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('synthetic data generation timed out'))
    }, GENERATE_TIMEOUT_MS)

    const log = (chunk: Buffer): void => {
      options.onLog?.(chunk.toString('utf-8'))
    }
    child.stdout.on('data', log)
    child.stderr.on('data', log)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`synthetic data generation exited with code ${String(code)}`))
    })
  })
}

/**
 * Whether to generate before starting the server.
 *
 * The single rule that matters: **never when a store already exists.** The
 * server's own resolution order is `--data` → `$BEACON_DATA_PATH` → the
 * app-data store, so anything the user has configured wins, and writing a
 * demo store over real data would be unforgivable.
 *
 * `BEACON_DATA_PATH` set means the user has named a source even if nothing is
 * there yet — that is their store to populate, not ours to fill.
 */
export function shouldGenerate(status: StoreStatus, env: NodeJS.ProcessEnv): boolean {
  if (status.exists) return false
  if ((env.BEACON_DATA_PATH ?? '').trim() !== '') return false
  if ((env.BEACON_NO_SYNTHETIC ?? '').trim() !== '') return false
  return true
}
