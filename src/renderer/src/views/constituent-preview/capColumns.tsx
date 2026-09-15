import type { ReactElement } from 'react'
import type { Column } from '../../components/Table/Table'
import { billions } from '../universe/universe'
import type { PreviewAsset } from './derivation'

/** A reference row as the engine sends it: named fields, untyped values. */
export type CapRows = ReadonlyMap<string, Record<string, unknown>>

const CONVERTED = {
  full: 'market_cap',
  float: 'free_float_market_cap'
} as const

const LOCAL = {
  full: 'market_cap_local',
  float: 'free_float_market_cap_local'
} as const

function number(rows: CapRows, identifier: string, field: string): number | undefined {
  const value = rows.get(identifier)?.[field]
  return typeof value === 'number' ? value : undefined
}

function text(rows: CapRows, identifier: string, field: string): string | undefined {
  const value = rows.get(identifier)?.[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * True when every name is already quoted in the index's own currency.
 *
 * `market_cap === market_cap_local` is the engine's own test for "this name
 * needed no conversion", and it is exact rather than approximate: `fx_rate_on`
 * short-circuits before any lookup when the two currencies match, so the two
 * fields carry the identical float — measured upstream against a value chosen
 * to expose a rounding difference if one existed.
 *
 * When it holds for everything on screen the local pair repeats the converted
 * pair in full, and two identical columns are worse than none.
 */
function allLocal(rows: CapRows, identifiers: readonly string[], currency: string): boolean {
  return identifiers.every(
    (identifier) => (text(rows, identifier, 'local_currency') ?? currency) === currency
  )
}

/**
 * A converted figure that could not be converted (BN-189).
 *
 * The record stays, the local half stays, and only the converted half goes
 * null — so a blank here means a missing RATE, not a missing cap, and the row
 * below proves it by carrying a number. A dash would report the fault as an
 * absence and send the reader looking for share counts they already have.
 */
function convertedCell(rows: CapRows, identifier: string, key: 'full' | 'float'): ReactElement {
  const value = number(rows, identifier, CONVERTED[key])
  if (value !== undefined) return <>{billions(value)}</>

  const local = number(rows, identifier, LOCAL[key])
  if (local === undefined) return <>—</>
  return <span className="cap-norate">no rate</span>
}

/**
 * Market caps, for an index weighted by them (BU-186, BU-195).
 *
 * Both kinds, always, when either is shown. `use_free_float` decides which
 * one the weights came FROM, and seeing only that one leaves a reader unable
 * to tell a small company from a closely held one — which is the whole
 * distinction the parameter exists to make.
 *
 * And both currencies. A cap used to arrive converted into a hard-coded USD
 * while the weighting converted into the index's own currency, so a EUR index
 * showed dollar caps beside euro weights and the column that exists to
 * explain a weight could not be held against one. The converted figure is
 * what compares to a weight; the local figure is the fact about the company.
 *
 * Derived market fields rather than stored reference ones: py-beacon computes
 * a cap as price × shares × fx at request time. That is also the arithmetic
 * `MarketCapWeighted` does, so a dash in this column and an equal-weighted
 * index are the same missing datum seen twice.
 */
export function capColumns(
  rows: CapRows,
  identifiers: readonly string[],
  useFreeFloat: boolean,
  /** The index's currency — what the converted figures were converted into. */
  currency: string
): Column<PreviewAsset>[] {
  /*
   * Local first, converted second, each pair followed by its unit.
   *
   * The reading order Karan asked for, and it is the order the numbers are
   * made in: the exchange reports a figure, the engine converts it, and the
   * converted one is what stands beside the weight. The unit trails its pair
   * rather than heading it, so a row scans as "this many, of those".
   */
  const local: Column<PreviewAsset>[] = [
    {
      key: 'market_cap_local',
      header: 'Market Cap (bn Local Ccy)',
      width: 165,
      align: 'right',
      render: (asset) => billions(number(rows, asset.identifier, LOCAL.full))
    },
    {
      key: 'free_float_market_cap_local',
      header: 'FF Market Cap (bn Local Ccy)',
      width: 180,
      align: 'right',
      render: (asset) => billions(number(rows, asset.identifier, LOCAL.float))
    },
    {
      key: 'local_currency',
      header: 'Local Ccy',
      width: 75,
      render: (asset) => text(rows, asset.identifier, 'local_currency') ?? '—'
    }
  ]

  const converted: Column<PreviewAsset>[] = [
    {
      key: 'market_cap',
      header: 'Market Cap (bn Index Ccy)',
      width: 170,
      align: 'right',
      emphasis: !useFreeFloat,
      render: (asset) => convertedCell(rows, asset.identifier, 'full')
    },
    {
      key: 'free_float_market_cap',
      header: 'FF Market Cap (bn Index Ccy)',
      width: 185,
      align: 'right',
      emphasis: useFreeFloat,
      render: (asset) => convertedCell(rows, asset.identifier, 'float')
    },
    {
      // One value for the whole table, but it is the unit on the two columns
      // beside it and the pair above reads wrong without its own.
      key: 'index_currency',
      header: 'Index Ccy',
      width: 75,
      render: () => currency
    }
  ]

  // Nothing needed converting, so the local group repeats the converted one
  // in full — and the converted group is the one that compares to a weight.
  if (allLocal(rows, identifiers, currency)) return converted
  return [...local, ...converted]
}
