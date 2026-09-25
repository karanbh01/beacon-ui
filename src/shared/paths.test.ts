import { describe, expect, it } from 'vitest'
import { comparablePath, folderName } from './paths'

describe('the name an opened folder gets', () => {
  /*
   * Windows paths separate with a backslash, and Windows is the only platform
   * that ships. The first version of this split on `/` alone — a backslash
   * lost between a shell heredoc and the file — so a picked folder would have
   * been named with its whole path. Lint flagged the escape; this pins the
   * behaviour, which is what actually matters.
   */
  it('takes the last segment of a Windows path', () => {
    expect(folderName('D:\\research\\prices')).toBe('prices')
  })

  it('takes the last segment of a POSIX path', () => {
    expect(folderName('/home/me/prices')).toBe('prices')
  })

  it('ignores a trailing separator', () => {
    expect(folderName('D:\\research\\prices\\')).toBe('prices')
  })

  it('handles a mixed path, which Windows accepts', () => {
    expect(folderName('D:/research\\prices')).toBe('prices')
  })
})

describe('when two spellings are one folder', () => {
  // A store saved by an older build is matched against the engine's list by
  // path (BU-215); a mismatch here registers the same folder twice.
  it('ignores case, separator and a trailing separator, as Windows does', () => {
    expect(comparablePath('D:/Data/Prices/')).toBe(comparablePath('d:/data/prices'))
  })

  it('still tells different folders apart', () => {
    expect(comparablePath('D:/data/prices')).not.toBe(comparablePath('D:/data/rates'))
  })
})
