import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_HOLDING_COLUMNS, useHoldingColumnsStore } from './holdingColumns'

describe('the holding columns a table shows (Karan, 2026-10-19)', () => {
  beforeEach(() => {
    useHoldingColumnsStore.setState({ defaults: DEFAULT_HOLDING_COLUMNS, byTable: {} })
  })

  it('starts on name, asset class, sector and country, the engine default', () => {
    expect(useHoldingColumnsStore.getState().defaults).toEqual([
      'name',
      'asset_class',
      'sector',
      'country_domicile'
    ])
  })

  it("keeps a table's own choice apart from the default, and can put it back", () => {
    const { setTable, setDefaults } = useHoldingColumnsStore.getState()
    setTable('attribution', ['sector'])
    setDefaults(['name'])

    expect(useHoldingColumnsStore.getState().byTable.attribution).toEqual(['sector'])
    expect(useHoldingColumnsStore.getState().defaults).toEqual(['name'])

    setTable('attribution', undefined)
    expect(useHoldingColumnsStore.getState().byTable).toEqual({})
  })

  it('falls back to the default from a stored value that is not a list of names', async () => {
    const { persist } = useHoldingColumnsStore
    localStorage.setItem(
      'beacon.holding-columns',
      JSON.stringify({ state: { defaults: 'sector', byTable: { a: ['name'], b: 3 } }, version: 1 })
    )
    await persist.rehydrate()

    expect(useHoldingColumnsStore.getState().defaults).toEqual(DEFAULT_HOLDING_COLUMNS)
    expect(useHoldingColumnsStore.getState().byTable).toEqual({ a: ['name'] })
  })
})
