import { describe, expect, it } from 'vitest'
import { environmentFor, parseSettings } from './dataSettings'

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
