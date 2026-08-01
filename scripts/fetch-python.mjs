// Build the bundled Python payload (ADR-0003).
//
// Downloads a python-build-standalone release for the target platform,
// unpacks it into `resources/python/`, and pip-installs py-beacon into it.
// Run by `prepack`; the payload is gitignored and never committed.
//
//   node scripts/fetch-python.mjs [--platform win32|darwin] [--arch x64|arm64]
//                                 [--skip-install]   download and unpack only

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const PAYLOAD = join(ROOT, 'resources', 'python')
const CACHE = join(ROOT, 'node_modules', '.cache', 'python-standalone')

/**
 * Pinned build, not "latest".
 *
 * A packaging step that silently changes its interpreter between runs makes
 * two builds of the same commit different artefacts. Bumping this is a
 * deliberate edit with a diff.
 */
const RELEASE = '20250612'
const VERSION = '3.12.11'

/** platform-arch → the asset name in that release. */
const ASSETS = {
  'win32-x64': `cpython-${VERSION}+${RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
  'darwin-arm64': `cpython-${VERSION}+${RELEASE}-aarch64-apple-darwin-install_only.tar.gz`,
  'darwin-x64': `cpython-${VERSION}+${RELEASE}-x86_64-apple-darwin-install_only.tar.gz`,
  'linux-x64': `cpython-${VERSION}+${RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz`
}

const BASE = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}`

/**
 * Where py-beacon comes from.
 *
 * Not PyPI — it is not published there. A sibling checkout wins when there is
 * one, so a packaging run on this machine ships the py-beacon being worked
 * on; CI has no checkout and falls back to the git ref, which is the same
 * source the spec-drift workflow installs from.
 */
const PY_BEACON_REF = process.env.PY_BEACON_REF ?? 'main'

function pyBeaconRequirement(root) {
  const sibling = resolve(root, '..', 'py-beacon')
  if (existsSync(join(sibling, 'pyproject.toml'))) return `${sibling}[server]`
  return `py-beacon[server] @ git+https://github.com/karanbh01/py-beacon@${PY_BEACON_REF}`
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

const platform = arg('platform', process.platform)
const arch = arg('arch', process.arch)
const key = `${platform}-${arch}`
const asset = ASSETS[key]

if (asset === undefined) {
  console.error(`[python] no standalone build mapped for ${key}.`)
  console.error(`[python] known: ${Object.keys(ASSETS).join(', ')}`)
  process.exit(1)
}

/** The interpreter inside an unpacked payload. */
export function payloadPython(root, targetPlatform = platform) {
  return targetPlatform === 'win32'
    ? join(root, 'python', 'python.exe')
    : join(root, 'python', 'bin', 'python3')
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function download(url, to) {
  const response = await fetch(url)
  if (!response.ok || response.body === null) {
    throw new Error(`${url} → ${String(response.status)} ${response.statusText}`)
  }
  await pipeline(response.body, createWriteStream(to))
}

async function digest(path) {
  const hash = createHash('sha256')
  const { createReadStream } = await import('node:fs')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * The tar to use.
 *
 * On Windows the `tar` on PATH is often Git's GNU build, which reads
 * `C:\path` as `host:path` and tries to resolve a remote called "C" — the
 * failure is "Cannot connect to C: resolve failed", which says nothing about
 * drive letters. Windows 10+ ships bsdtar in System32, which handles them.
 */
function tarBinary() {
  if (platform !== 'win32') return 'tar'
  const system32 = join(process.env.SystemRoot ?? String.raw`C:\Windows`, 'System32', 'tar.exe')
  return existsSync(system32) ? system32 : 'tar'
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  const archive = join(CACHE, asset)

  if (!(await exists(archive))) {
    console.log(`[python] downloading ${asset}`)
    await download(`${BASE}/${asset}`, archive)
  } else {
    console.log(`[python] cached ${asset}`)
  }

  // The release publishes a .sha256 next to each asset. Checking it turns a
  // truncated download into a build failure rather than a broken installer.
  const expected = await fetch(`${BASE}/${asset}.sha256`)
    .then((response) => (response.ok ? response.text() : ''))
    .catch(() => '')

  if (expected.trim() !== '') {
    const actual = await digest(archive)
    if (!expected.toLowerCase().includes(actual)) {
      await rm(archive, { force: true })
      throw new Error(`[python] digest mismatch for ${asset}; the cached file has been removed`)
    }
    console.log('[python] digest verified')
  } else {
    console.warn('[python] no published digest; skipping verification')
  }

  await rm(PAYLOAD, { recursive: true, force: true })
  await mkdir(PAYLOAD, { recursive: true })
  execFileSync(tarBinary(), ['-xzf', archive, '-C', PAYLOAD], { stdio: 'inherit' })

  const python = payloadPython(PAYLOAD)

  if (process.argv.includes('--skip-install')) {
    console.log(`[python] unpacked; interpreter at ${python}`)
    return
  }

  console.log(`[python] installing py-beacon into ${python}`)

  // `--no-warn-script-location` because the scripts directory is inside the
  // payload and is never on the user's PATH, which is fine: we invoke the
  // module, not a console script.
  const requirement = pyBeaconRequirement(ROOT)
  console.log(`[python] source: ${requirement}`)
  execFileSync(python, ['-m', 'pip', 'install', '--no-warn-script-location', requirement], {
    stdio: 'inherit'
  })

  console.log(`[python] payload ready at ${PAYLOAD}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
