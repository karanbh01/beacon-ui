import type { ReactElement } from 'react'
import type { StatisticSpec, TableFrame } from '../../api/analytics'
import { Table } from '../../components/Table/Table'

/*
 * Each fundamental's name and how it reads, until the catalogue gives the
 * characteristics table a unit per row (py-beacon, 2026-11-19).
 */
const FUNDAMENTALS: Record<
  string,
  { label: string; format: (value: number, currency: string) => string }
> = {
  MARKET_CAP: {
    label: 'Market cap',
    format: (value, currency) => `${currency} ${(value / 1e9).toFixed(1)}bn`
  },
  PE_RATIO: { label: 'Price to earnings', format: (value) => `${value.toFixed(1)}x` },
  PB_RATIO: { label: 'Price to book', format: (value) => `${value.toFixed(1)}x` },
  DIVIDEND_YIELD: { label: 'Dividend yield', format: (value) => `${(value * 100).toFixed(1)}%` }
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
  currency
}: {
  classification: TableFrame | undefined
  classificationSpec: StatisticSpec | undefined
  fundamentals: TableFrame | undefined
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
      {fundamentals !== undefined && <Fundamentals frame={fundamentals} currency={currency} />}
    </div>
  )
}

interface FundamentalRow {
  measure: string
  fund: number | null
  index: number | null
}

function Fundamentals({ frame, currency }: { frame: TableFrame; currency: string }): ReactElement {
  const at = (name: string): number => frame.columns.indexOf(name)
  const number = (value: unknown): number | null => (typeof value === 'number' ? value : null)
  const rows: FundamentalRow[] = frame.data.map((cells) => ({
    measure: String(cells[at('measure')] ?? ''),
    fund: number(cells[at('fund')]),
    index: number(cells[at('index')])
  }))
  return (
    <Table
      columns={[
        {
          key: 'measure',
          header: 'Fundamentals',
          width: 110,
          rowName: true,
          render: (row) => FUNDAMENTALS[row.measure]?.label ?? row.measure
        },
        {
          key: 'fund',
          header: 'Fund',
          width: 74,
          align: 'right',
          render: (row) => fundamental(row.measure, row.fund, currency)
        },
        {
          key: 'index',
          header: 'Index',
          width: 74,
          align: 'right',
          render: (row) => fundamental(row.measure, row.index, currency)
        }
      ]}
      rows={rows}
      getRowId={(row) => row.measure}
    />
  )
}

/** A fundamental in its own unit, a dash where no held name has it. */
function fundamental(code: string, value: number | null, currency: string): string {
  if (value === null) return '—'
  return FUNDAMENTALS[code]?.format(value, currency) ?? value.toFixed(2)
}
