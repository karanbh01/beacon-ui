import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { capColumns, type CapRows } from './capColumns'
import type { PreviewAsset } from './derivation'

/**
 * A cap in two currencies (BU-195, BN-189).
 *
 * The engine publishes each money field twice — converted into the currency
 * the request names, and unconverted in the instrument's own — plus both
 * codes. What this pane does with the pair is the decision under test.
 */

const ASSET = (identifier: string): PreviewAsset =>
  ({ identifier, weight: 0.1, included: true }) as unknown as PreviewAsset

function rows(entries: Record<string, Record<string, unknown>>): CapRows {
  return new Map(Object.entries(entries))
}

/** What one column renders for one name, as text. */
function cell(
  built: ReturnType<typeof capColumns>,
  key: string,
  asset: PreviewAsset
): string | null {
  const column = built.find((candidate) => candidate.key === key)
  if (column === undefined) throw new Error(`no ${key} column`)
  const { container } = render(<>{column.render(asset)}</>)
  return container.textContent
}

const MIXED = rows({
  JPSML: {
    market_cap: 7_000_000_000,
    market_cap_local: 1_044_776_119_403,
    free_float_market_cap: 5_000_000_000,
    free_float_market_cap_local: 746_268_656_716,
    local_currency: 'JPY',
    market_cap_currency: 'USD'
  },
  USBIG: {
    market_cap: 480_000_000_000,
    market_cap_local: 480_000_000_000,
    free_float_market_cap: 400_000_000_000,
    free_float_market_cap_local: 400_000_000_000,
    local_currency: 'USD',
    market_cap_currency: 'USD'
  }
})

describe('the currency a cap is in', () => {
  it('names the index currency in the header, rather than leaving it assumed', () => {
    // A EUR index converted into EUR and a USD one into USD are the same
    // column with different contents, and the reader cannot see which from
    // the numbers.
    const built = capColumns(MIXED, ['JPSML'], false, 'EUR')
    expect(built.map((column) => column.header)).toContain('Mkt cap (bn EUR)')
  })

  it('shows the local figure beside it when the two can differ', () => {
    const built = capColumns(MIXED, ['JPSML', 'USBIG'], false, 'USD')
    const keys = built.map((column) => column.key)

    expect(keys).toContain('market_cap_local')
    expect(keys).toContain('free_float_market_cap_local')
    // The unit once per row, not twice: it is one fact about the name.
    expect(keys.filter((key) => key === 'local_currency')).toHaveLength(1)
  })

  it('drops the local pair when nothing on screen needed converting', () => {
    /*
     * `market_cap === market_cap_local` is the engine's own test for "this
     * name needed no conversion", and it is exact: `fx_rate_on` returns
     * before any lookup when the currencies match. So when it holds for
     * every name the local columns repeat the converted ones in full, and
     * two identical columns are worse than none.
     */
    const built = capColumns(MIXED, ['USBIG'], false, 'USD')
    expect(built.map((column) => column.key)).toEqual(['market_cap', 'free_float_market_cap'])
  })

  it('keeps the local pair as soon as one name is quoted elsewhere', () => {
    const built = capColumns(MIXED, ['USBIG', 'JPSML'], false, 'USD')
    expect(built.map((column) => column.key)).toContain('market_cap_local')
  })

  it('emphasises the half the weights were actually made of', () => {
    const full = capColumns(MIXED, ['USBIG'], false, 'USD')
    const float = capColumns(MIXED, ['USBIG'], true, 'USD')

    expect(full.find((column) => column.key === 'market_cap')?.emphasis).toBe(true)
    expect(float.find((column) => column.key === 'market_cap')?.emphasis).toBe(false)
    expect(float.find((column) => column.key === 'free_float_market_cap')?.emphasis).toBe(true)
  })
})

describe('a cap that could not be converted', () => {
  /*
   * The engine nulls the converted half only, and leaves the local half and
   * both codes standing (BN-189) — so this is a missing RATE, and the row
   * itself holds the proof.
   */
  const NO_RATE = rows({
    CHFCO: {
      market_cap: null,
      market_cap_local: 90_000_000_000,
      free_float_market_cap: null,
      free_float_market_cap_local: 60_000_000_000,
      local_currency: 'CHF',
      market_cap_currency: 'USD'
    }
  })

  it('says the rate is missing rather than drawing a dash', () => {
    // A dash is what a missing cap looks like, and this is not one. Reported
    // as an absence it sends the reader after share counts they already have.
    const built = capColumns(NO_RATE, ['CHFCO'], false, 'USD')
    expect(cell(built, 'market_cap', ASSET('CHFCO'))).toBe('no rate')
  })

  it('still shows the local figure, because the server holds it', () => {
    const built = capColumns(NO_RATE, ['CHFCO'], false, 'USD')
    expect(cell(built, 'market_cap_local', ASSET('CHFCO'))).toBe('90')
  })

  it('dashes only when there is no cap at all', () => {
    const nothing = rows({ CMP000: { local_currency: 'USD' } })
    const built = capColumns(nothing, ['CMP000'], false, 'USD')
    expect(cell(built, 'market_cap', ASSET('CMP000'))).toBe('—')
  })
})

describe('a name the reference batch had no row for', () => {
  it('dashes its currency rather than claiming the index currency', () => {
    /*
     * An absent row is not a name quoted in USD. It reads as one only
     * because the column has nothing else to show — so the cell says
     * nothing, while `allLocal` still treats it as needing no conversion,
     * which is the honest reading of "we do not know".
     */
    const built = capColumns(MIXED, ['JPSML', 'MISSING'], false, 'USD')
    expect(cell(built, 'local_currency', ASSET('MISSING'))).toBe('—')
  })
})
