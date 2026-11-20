import type { ReactElement } from 'react'
import type { StatisticSpec, TableFrame, Unit } from '../../api/analytics'
import { Table } from '../../components/Table/Table'

/*
 * How a fundamental reads by its unit (py-beacon BN-425): a market cap is
 * money in the run's currency, the P/E and P/B ratios, the yield a fraction.
 */
const BY_UNIT: Partial<Record<Unit, (value: number, currency: string) => string>> = {
  money: (value, currency) => `${currency} ${(value / 1e9).toFixed(1)}bn`,
  ratio: (value) => `${value.toFixed(1)}x`,
  fraction: (value) => `${(value * 100).toFixed(1)}%`
}

/**
 * Beside the style box (BU-294): the fund's classification in Morningstar's
 * words, "Large blend", the index's under it, then the fund's fundamentals
 * against the index's. All the engine's; the classification is provisional
 * until py-beacon names it.
 */
export function StyleProfile({
  classification,
  classificationSpec,
  fundamentals,
  fundamentalsSpec,
  currency
}: {
  classification: TableFrame | undefined
  classificationSpec: StatisticSpec | undefined
  fundamentals: TableFrame | undefined
  /** The characteristics' columns, with each figure's label and unit. */
  fundamentalsSpec: StatisticSpec | undefined
  /** The run's own currency, which market cap is in. */
  currency: string
}): ReactElement {
  const labelOf = (column: string, code: string): string =>
    classificationSpec?.columns?.find((candidate) => candidate.name === column)?.labels?.[code] ??
    code
  const classOf = (book: string): string | undefined => {
    if (classification === undefined) return undefined
    const row = classification.data.find((cells) => cells[0] === book)
    const size = row?.[classification.columns.indexOf('size')]
    const style = row?.[classification.columns.indexOf('style')]
    if (typeof size !== 'string' || typeof style !== 'string') return undefined
    return `${labelOf('size', size)} ${labelOf('style', style).toLowerCase()}`
  }
  const fund = classOf('fund')
  const index = classOf('index')

  return (
    <div className="style-profile">
      <div className="style-profile-class">
        <span className="style-profile-name">{fund ?? 'Not classified'}</span>
        {index !== undefined && (
          <span className="style-profile-index type-11">{`The index is ${index.toLowerCase()}`}</span>
        )}
      </div>
      {fundamentals !== undefined && (
        <Fundamentals frame={fundamentals} spec={fundamentalsSpec} currency={currency} />
      )}
    </div>
  )
}

interface FundamentalRow {
  code: string
  label: string
  unit: Unit | null | undefined
  fund: number | null
  index: number | null
}

function Fundamentals({
  frame,
  spec,
  currency
}: {
  frame: TableFrame
  spec: StatisticSpec | undefined
  currency: string
}): ReactElement {
  const rows = fundamentalsOf(frame, spec)
  return (
    <Table
      columns={[
        {
          key: 'label',
          header: 'Fundamentals',
          width: 110,
          rowName: true,
          render: (row) => row.label
        },
        {
          key: 'fund',
          header: 'Fund',
          width: 74,
          align: 'right',
          render: (row) => fundamental(row.unit, row.fund, currency)
        },
        {
          key: 'index',
          header: 'Index',
          width: 74,
          align: 'right',
          render: (row) => fundamental(row.unit, row.index, currency)
        }
      ]}
      rows={rows}
      getRowId={(row) => row.code}
    />
  )
}

/**
 * The latest rebalance's figures, a row per characteristic. The table has a
 * row per rebalance and a column per book and figure ("fund/MARKET_CAP");
 * each figure's label is its fund column's, less the book's name.
 */
function fundamentalsOf(frame: TableFrame, spec: StatisticSpec | undefined): FundamentalRow[] {
  const latest = frame.data.at(-1) ?? []
  const value = (name: string): number | null => {
    const cell = latest[frame.columns.indexOf(name)]
    return typeof cell === 'number' ? cell : null
  }
  return frame.columns
    .filter((name) => name.startsWith('fund/'))
    .map((name) => {
      const code = name.slice('fund/'.length)
      const column = spec?.columns?.find((candidate) => candidate.name === name)
      const label = column?.label.replace(/^Fund /, '') ?? code
      return {
        code,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        unit: column?.unit,
        fund: value(name),
        index: value(`index/${code}`)
      }
    })
}

/** A fundamental in its own unit, a dash where no held name has it. */
function fundamental(
  unit: Unit | null | undefined,
  value: number | null,
  currency: string
): string {
  if (value === null) return '—'
  return (unit == null ? undefined : BY_UNIT[unit]?.(value, currency)) ?? value.toFixed(2)
}
