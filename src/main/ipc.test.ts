import { isAbsolute, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeFilename } from './ipc'

const TEMP = join('C:', 'tmp')

/** The invariant that matters: the result stays inside the directory. */
function staysInside(name: string): boolean {
  const path = join(TEMP, safeFilename(name))
  const inside = relative(TEMP, path)
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)
}

/**
 * The renderer supplies this name, and the renderer is treated as hostile
 * (ADR-0001). Everything here is about what must NOT become a path.
 */
describe('safeFilename', () => {
  it('leaves an ordinary report name alone', () => {
    expect(safeFilename('TECH10-FACTSHEET-A4-2026-07-28.pdf')).toBe(
      'TECH10-FACTSHEET-A4-2026-07-28.pdf'
    )
  })

  it('cannot escape the directory it is joined onto', () => {
    // `_.._.bashrc` is a fine filename — dots are only dangerous next to a
    // separator, so the assertion is about the resulting PATH, not the text.
    for (const attempt of [
      '../../.bashrc',
      String.raw`..\..\system32\evil.dll`,
      '/etc/passwd',
      String.raw`C:\Windows\notepad.exe`,
      '..'
    ]) {
      expect(staysInside(attempt), attempt).toBe(true)
    }
  })

  it('strips a leading dot, so nothing lands as a hidden file', () => {
    expect(safeFilename('.profile').startsWith('.')).toBe(false)
  })

  it('refuses separators on either platform', () => {
    const name = safeFilename('a/b\\c:d')
    expect(name).not.toMatch(/[/\\:]/)
  })

  it('replaces rather than strips, so two names cannot collapse into one', () => {
    expect(safeFilename('a b.pdf')).not.toBe(safeFilename('ab.pdf'))
  })

  it('falls back rather than producing an empty path', () => {
    expect(safeFilename('...')).toBe('report.pdf')
    expect(safeFilename('')).toBe('report.pdf')
  })

  it('bounds the length', () => {
    expect(safeFilename('x'.repeat(500)).length).toBeLessThanOrEqual(120)
  })
})
