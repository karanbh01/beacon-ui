import { execFile } from 'node:child_process'
import { spawn } from 'node:child_process'

/** py-beacon's own CLI, so the flags stay its business rather than ours. */
export const SYNTHETIC_MODULE = 'beacon.synthetic'

/**
 * Pinned, so two machines and two runs see identical data.
 *
 * BU-35's screenshot diffs need that, and it removes one more place for
 * "works on mine" to hide. Changing it should be a deliberate edit.
 */
export const SYNTHETIC_SEED = 42

/**
 * Five minutes, and generous on purpose.
 *
 * py-beacon quotes about fifteen seconds for the CLI's default. Measured on
 * this machine it took 109 seconds, and then 143 once BN-140 added features —
 * nearly a million more rows. The cost tracks whatever the generator has
 * learned to produce, which is not something this app can predict.
 *
 * The asymmetry decides the number: firing early costs a launch with no data
 * at all, and firing late costs a wait somebody already expects. It only ever
 * fires on a generator that has genuinely wedged.
 */
const GENERATE_TIMEOUT_MS = 300_000

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

/**
 * Delete a store, through python.
 *
 * **Not `fs.rm` from Node**, and the reason is the same one `readStoreStatus`
 * gives for not reimplementing the path. Under the Microsoft Store build of
 * python, MSIX redirects `%LOCALAPPDATA%` writes into a package-private cache
 * and reads them back transparently: py-beacon reports its store at
 * `…\AppData\Localeaconeacon\market-store`, that path does not exist to
 * any other process, and the bytes are really under
 * `…\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.13_…\LocalCache`.
 * Node deleting the reported path would remove nothing and report success.
 *
 * Guarded by `store.exists`, so this only ever removes a directory holding a
 * manifest and market data. A path that is not a store is not ours to delete,
 * and a bug in the caller must not be able to turn this into `rm -rf` on a
 * home directory.
 */
export function removeStore(python: string): Promise<boolean> {
  const script = [
    'import shutil',
    'from beacon.data import store',
    'p = store.default_path()',
    'ok = store.exists(p)',
    'shutil.rmtree(p) if ok else None',
    'print("1" if ok else "0")'
  ].join('; ')

  return new Promise((resolve, reject) => {
    execFile(python, ['-c', script], { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      if (error !== null) {
        reject(new Error(error.message))
        return
      }
      resolve(stdout.trim().endsWith('1'))
    })
  })
}

export interface GenerateOptions {
  assets?: number
  seed?: number
  onLog?: (line: string) => void
}

/**
 * The command line, kept pure so what it does and does not say is testable.
 *
 * **Size and date window are the CLI's to choose.** Its defaults are the
 * client-facing dataset — five thousand names over the ten years ending today
 * — and are deliberately larger than the library's, which has to stay small
 * enough for a test to depend on. This module used to pass `--assets 512`,
 * which silently held the app at the old size after py-beacon widened its
 * default, and cost the app REGION, COUNTRY and a CURRENCY column with more
 * than one value: those arrived with BN-128 and only appear in a store
 * generated after it.
 *
 * No `--out` either, and for the same reason: py-beacon's CLI already
 * defaults to the app-data path its own server reads.
 */
export function generateArgs(options: GenerateOptions = {}): string[] {
  const args = ['-m', SYNTHETIC_MODULE, '--seed', String(options.seed ?? SYNTHETIC_SEED)]
  // Only when a caller genuinely means a different size — the CLI's own
  // default is the right answer for the app.
  if (options.assets !== undefined) args.push('--assets', String(options.assets))
  return args
}

/** Generate a synthetic store where the server auto-loads it. */
export function generateSynthetic(python: string, options: GenerateOptions = {}): Promise<void> {
  const args = generateArgs(options)

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
