import { describe, expect, it } from 'vitest'
import { externalUrl } from './externalUrl'

/**
 * The scheme check is the whole of BU-112's safety.
 *
 * `shell.openExternal` hands the string to the OS, so a scheme other than
 * http(s) turns "open a link" into "launch something" — and the renderer is
 * the part of the app most likely to be handed a URL by something else.
 */
describe('externalUrl', () => {
  it('passes an ordinary web link', () => {
    expect(externalUrl('https://github.com/karanbh01/beacon-ui')).toBe(
      'https://github.com/karanbh01/beacon-ui'
    )
    expect(externalUrl('http://localhost:8000/docs')).toBe('http://localhost:8000/docs')
  })

  it('refuses a scheme that launches something', () => {
    expect(externalUrl('file:///C:/Windows/System32/calc.exe')).toBeUndefined()
    expect(externalUrl('ms-settings:privacy')).toBeUndefined()
    expect(externalUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('refuses anything that is not a URL at all', () => {
    expect(externalUrl('not a url')).toBeUndefined()
    expect(externalUrl('')).toBeUndefined()
  })
})
