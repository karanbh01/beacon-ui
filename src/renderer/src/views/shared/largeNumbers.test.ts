import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NUMBER_PREFERENCES,
  formatCount,
  formatMoney,
  moneyHeader,
  sanitisePreferences
} from './largeNumbers'

/**
 * Data Preferences (BU-228): one choice of unit and precision for every
 * large number, where each table had its own fixed rule.
 */
describe('a money amount', () => {
  const cap = 3_164_250_000_000

  it('defaults to whole billions, which is what the cap columns always showed', () => {
    expect(formatMoney(cap, DEFAULT_NUMBER_PREFERENCES)).toBe('3,164')
  })

  it('reads in the unit chosen, at the precision chosen', () => {
    expect(formatMoney(cap, { unit: 'millions', decimals: 1 })).toBe('3,164,250.0')
    expect(formatMoney(cap, { unit: 'trillions', decimals: 2 })).toBe('3.16')
  })

  it('carries its own suffix under auto, since no one unit fits the column', () => {
    expect(formatMoney(cap, { unit: 'auto', decimals: 2 })).toBe('3.16T')
    expect(formatMoney(4_200_000, { unit: 'auto', decimals: 1 })).toBe('4.2M')
  })

  it('is a dash where there is no number, never NaN', () => {
    expect(formatMoney(undefined, DEFAULT_NUMBER_PREFERENCES)).toBe('—')
    expect(formatMoney(null, DEFAULT_NUMBER_PREFERENCES)).toBe('—')
    expect(formatMoney(Number.NaN, DEFAULT_NUMBER_PREFERENCES)).toBe('—')
  })
})

describe('a large count', () => {
  it('keeps its own suffix whatever the money unit, at the chosen precision', () => {
    // An ADV in "billions" would read 0.0 and say nothing.
    expect(formatCount(4_182_000, 1)).toBe('4.2M')
    expect(formatCount(4_182_000, 0)).toBe('4M')
    expect(formatCount(950, 0)).toBe('950')
  })
})

describe('a money column header', () => {
  it('names the unit, or leaves it to the values under auto', () => {
    expect(moneyHeader('Market Cap', 'Local Ccy', 'billions')).toBe('Market Cap (bn Local Ccy)')
    expect(moneyHeader('Market Cap', 'USD', 'millions')).toBe('Market Cap (mn USD)')
    expect(moneyHeader('Market Cap', 'USD', 'auto')).toBe('Market Cap (USD)')
  })
})

describe('a stored preference', () => {
  it('falls back field by field when it is not one', () => {
    expect(sanitisePreferences({ unit: 'gazillions', decimals: 2 })).toEqual({
      unit: 'billions',
      decimals: 2
    })
    expect(sanitisePreferences({ unit: 'millions', decimals: 9 })).toEqual({
      unit: 'millions',
      decimals: 0
    })
    expect(sanitisePreferences('nonsense')).toEqual(DEFAULT_NUMBER_PREFERENCES)
  })
})
