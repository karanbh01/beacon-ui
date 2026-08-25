import { describe, expect, it } from 'vitest'
import { environmentFor, parseSettings, staleReason } from './dataSettings'

describe('parseSettings', () => {
  it('falls back on anything it does not recognise', () => {
    // A hand-edited or truncated file must not stop the app starting.
    expect(parseSettings(null)).toEqual({ storePath: '', synthetic: true })
    expect(parseSettings({ storePath: 7, synthetic: 'yes' })).toEqual({
      storePath: '',
      synthetic: true
    })
  })

  it('keeps what it does recognise', () => {
    expect(parseSettings({ storePath: 'D:/store', synthetic: false })).toEqual({
      storePath: 'D:/store',
      synthetic: false
    })
  })
})

describe('environmentFor', () => {
  it('applies a saved store path when the environment names none', () => {
    const env = environmentFor({ storePath: 'D:/store', synthetic: true }, {})
    expect(env.BEACON_DATA_PATH).toBe('D:/store')
  })

  it('lets a real environment variable win', () => {
    // Somebody typed this a second ago, from a terminal or a launcher. A
    // saved preference must not quietly outrank it.
    const env = environmentFor(
      { storePath: 'D:/saved', synthetic: true },
      {
        BEACON_DATA_PATH: 'E:/typed'
      }
    )
    expect(env.BEACON_DATA_PATH).toBe('E:/typed')
  })

  it('turns generation off when the setting says so', () => {
    expect(environmentFor({ storePath: '', synthetic: false }, {}).BEACON_NO_SYNTHETIC).toBe('1')
  })

  it('leaves generation alone when the setting allows it', () => {
    expect(
      environmentFor({ storePath: '', synthetic: true }, {}).BEACON_NO_SYNTHETIC
    ).toBeUndefined()
  })

  it('ignores a path that is only whitespace', () => {
    expect(
      environmentFor({ storePath: '   ', synthetic: true }, {}).BEACON_DATA_PATH
    ).toBeUndefined()
  })
})

/**
 * The marker's whole job is to separate "we generated this" from "this is
 * somebody's data" (BU-89). These are the cases where the answer decides
 * whether the app offers to delete a couple of hundred megabytes.
 */
describe('staleReason', () => {
  const args = ['-m', 'beacon.synthetic', '--seed', '42']
  const marker = { engineVersion: '0.6.0', args, generatedAt: '2026-08-01T09:00:00.000Z' }

  it('has no opinion without a marker, because the store is not ours', () => {
    expect(staleReason(undefined, '0.6.0', args)).toBeUndefined()
  })

  it('says nothing when the store matches what this build would generate', () => {
    expect(staleReason(marker, '0.6.0', args)).toBeUndefined()
  })

  it('names both versions when py-beacon has moved on', () => {
    const reason = staleReason(marker, '0.7.0', args)
    expect(reason).toContain('0.6.0')
    expect(reason).toContain('0.7.0')
  })

  it('notices a change in the arguments alone', () => {
    // The `--assets 512` case: same engine, different command, 512 names
    // instead of the CLI's five thousand.
    expect(staleReason({ ...marker, args: [...args, '--assets', '512'] }, '0.6.0', args)).toBe(
      'generated with different options from the ones this build would use'
    )
  })

  it('waits rather than guessing when no version has been stamped yet', () => {
    // Written at generation, before any server was up to be asked. A launch
    // interrupted in between must not read as stale for ever.
    expect(staleReason({ ...marker, engineVersion: '' }, '0.6.0', args)).toBeUndefined()
  })

  it('has no opinion before the engine has reported a version', () => {
    expect(staleReason(marker, undefined, args)).toBeUndefined()
  })
})
