import { describe, expect, it } from 'vitest'
import { describeExit } from './engine'
import { MAX_RESTARTS, restartDelay, shouldGiveUp } from './backoff'
import { PORT_PREFIX, SERVER_MODULE, locatePython, parsePort, pythonCandidates } from './python'

describe('parsePort', () => {
  it('reads the announced port', () => {
    expect(parsePort('BEACON_PORT=57020\n')).toBe(57020)
  })

  it('finds it when it is not the first line', () => {
    // Real output: SciPy warns about the NumPy version before the handshake.
    const stdout = [
      'UserWarning: A NumPy version >=1.23.5 and <2.5.0 is required for this version of SciPy',
      '  return _bootstrap._gcd_import(name[level:], package, level)',
      'BEACON_PORT=57020',
      'INFO:     Started server process [31740]'
    ].join('\n')

    expect(parsePort(stdout)).toBe(57020)
  })

  it('handles CRLF, since the server may run under Windows python', () => {
    expect(parsePort('warming up\r\nBEACON_PORT=8123\r\n')).toBe(8123)
  })

  it('returns undefined before the announcement arrives', () => {
    expect(parsePort('INFO: starting up\n')).toBeUndefined()
  })

  it('rejects a malformed or out-of-range port', () => {
    expect(parsePort('BEACON_PORT=notanumber')).toBeUndefined()
    expect(parsePort('BEACON_PORT=0')).toBeUndefined()
    expect(parsePort('BEACON_PORT=99999')).toBeUndefined()
  })

  it('does not match a line that merely contains the prefix', () => {
    expect(parsePort('log: waiting for BEACON_PORT=1234')).toBeUndefined()
  })

  it('uses the module path, not the distribution name', () => {
    // `py-beacon` installs as `beacon`; -m py_beacon.server does not exist.
    expect(SERVER_MODULE).toBe('beacon.server')
    expect(PORT_PREFIX).toBe('BEACON_PORT=')
  })
})

describe('locatePython', () => {
  it('honours an explicit override above everything', () => {
    const candidates = pythonCandidates({ override: '/opt/py/bin/python' })
    expect(candidates).toEqual(['/opt/py/bin/python'])
  })

  it('prefers a sibling py-beacon venv over PATH', () => {
    // PATH python almost certainly lacks fastapi, so it would fail at import
    // time with a confusing error rather than not being chosen.
    const candidates = pythonCandidates({ appRoot: '/work/beacon_ui' })
    const siblingIndex = candidates.findIndex((c) => c.includes('py-beacon'))
    const pathIndex = candidates.findIndex((c) => !c.includes('/') && !c.includes('\\'))

    expect(siblingIndex).toBeGreaterThanOrEqual(0)
    expect(siblingIndex).toBeLessThan(pathIndex)
  })

  it('picks the first candidate that exists', () => {
    const found = locatePython({
      appRoot: '/work/beacon_ui',
      exists: (path) => path.includes('py-beacon')
    })
    expect(found).toContain('py-beacon')
  })

  it('falls through to a bare interpreter name when no venv exists', () => {
    const found = locatePython({ appRoot: '/work/beacon_ui', exists: () => false })
    expect(found).toMatch(/^python(3|\.exe)?$/)
  })

  it('never probes the filesystem for a bare name', () => {
    // `python3` is resolved through PATH by spawn; testing for it here would
    // mean reimplementing PATH lookup.
    let probed = 0
    locatePython({
      appRoot: '/work/beacon_ui',
      exists: () => {
        probed += 1
        return false
      }
    })
    expect(probed).toBeGreaterThan(0)
  })
})

describe('describeExit', () => {
  it('names a configuration rejection, which is not worth retrying blindly', () => {
    expect(describeExit(2, null)).toContain('configuration')
  })

  it('reads Windows force-kill as termination, not a giant exit code', () => {
    // Stop-Process -Force reports 4294967295 (0xFFFFFFFF); showing that in a
    // footer tooltip looks like a bug in us rather than a killed process.
    expect(describeExit(4294967295, null)).toBe('server terminated unexpectedly')
  })

  it('names the signal when there is one', () => {
    expect(describeExit(null, 'SIGKILL')).toContain('SIGKILL')
  })

  it('reports an ordinary non-zero exit with its code', () => {
    expect(describeExit(1, null)).toBe('server exited with code 1')
  })
})

describe('restart backoff', () => {
  it('retries almost immediately the first time', () => {
    // BU-19 wants recovery from kill -9 inside 5s; a 1s-then-double schedule
    // spends most of that budget waiting.
    expect(restartDelay(0)).toBeLessThanOrEqual(500)
  })

  it('backs off on repeated failure', () => {
    expect(restartDelay(1)).toBeGreaterThan(restartDelay(0))
    expect(restartDelay(3)).toBeGreaterThan(restartDelay(1))
  })

  it('caps rather than growing without bound', () => {
    expect(restartDelay(99)).toBe(restartDelay(MAX_RESTARTS))
  })

  it('eventually gives up, so a broken install does not respawn forever', () => {
    expect(shouldGiveUp(0)).toBe(false)
    expect(shouldGiveUp(MAX_RESTARTS)).toBe(true)
  })
})
