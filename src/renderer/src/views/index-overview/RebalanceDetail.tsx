import { useState, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Table, type Column } from '../../components/Table/Table'
import { fromFraction, percent } from '../shared/indexMetrics'
import { CompactMoney } from '../shared/LargeNumber'
import { useReferenceRows } from '../shared/queries'
import { fillRatio, quantity, type CappedName, type RemovedName } from './implementationRows'

type Unfilled = components['schemas']['UnfilledOrderPayload']
type List = 'removed' | 'capped' | 'unfilled'

/** How tall a list opens before it scrolls. */
const LIST_HEIGHT = 220

/**
 * Under an opened rebalance (Karan, 2026-11-20): the names its screens took
 * out, the names its caps cut down and the orders that did not fill, one list
 * at a time behind a switch that counts each. It opens on the first list
 * with anything in it.
 */
export function RebalanceDetail({
  date,
  removed,
  capped,
  unfilled
}: {
  date: string
  removed: readonly RemovedName[]
  capped: readonly CappedName[]
  unfilled: readonly Unfilled[]
}): ReactElement {
  const counts: Record<List, number> = {
    removed: removed.length,
    capped: capped.length,
    unfilled: unfilled.length
  }
  const segments = (['removed', 'capped', 'unfilled'] as const)
    .filter((list) => counts[list] > 0)
    .map((list) => ({ value: list, label: `${LIST_NAMES[list]} ${String(counts[list])}` }))
  const [chosen, setChosen] = useState<List | undefined>(undefined)
  const shown = chosen ?? segments[0]?.value ?? 'unfilled'
  // The removed names are no longer held, so their names come from the reference data then.
  const names = useReferenceRows(
    [...removed, ...capped].map((name) => name.id),
    ['NAME'],
    date
  )
  const nameOf = (id: string): string => {
    const fields = names.byIdentifier.get(id)
    const name = fields?.NAME ?? fields?.name
    return typeof name === 'string' ? name : '—'
  }

  return (
    <div className="rebalance-detail">
      {segments.length > 1 && (
        <SegmentedControl
          segments={segments}
          value={shown}
          onChange={setChosen}
          label={`What happened on ${date}`}
        />
      )}
      {shown === 'removed' && (
        <Table
          columns={removedColumns(nameOf)}
          rows={removed}
          getRowId={(name) => name.id}
          fillWidth
          maxBodyHeight={LIST_HEIGHT}
        />
      )}
      {shown === 'capped' && (
        <Table
          columns={cappedColumns(nameOf)}
          rows={capped}
          getRowId={(name) => name.id}
          fillWidth
          maxBodyHeight={LIST_HEIGHT}
        />
      )}
      {shown === 'unfilled' && (
        <Table
          columns={UNFILLED_COLUMNS}
          rows={unfilled}
          getRowId={(order) => order.asset_id}
          queryable
          fillWidth
          maxBodyHeight={LIST_HEIGHT}
        />
      )}
    </div>
  )
}

const LIST_NAMES: Record<List, string> = {
  removed: 'Removed',
  capped: 'Capped',
  unfilled: 'Unfilled'
}

function identity<T>(idOf: (row: T) => string, nameOf: (row: T) => string): Column<T>[] {
  return [
    { key: 'ticker', header: 'Ticker', width: 80, emphasis: true, render: idOf },
    { key: 'name', header: 'Name', width: 180, minWidth: 120, render: nameOf }
  ]
}

function removedColumns(nameOf: (id: string) => string): Column<RemovedName>[] {
  return [
    ...identity<RemovedName>(
      (name) => name.id,
      (name) => nameOf(name.id)
    ),
    { key: 'screen', header: 'Screen', width: 160, render: (name) => name.screen }
  ]
}

function cappedColumns(nameOf: (id: string) => string): Column<CappedName>[] {
  return [
    ...identity<CappedName>(
      (name) => name.id,
      (name) => nameOf(name.id)
    ),
    {
      key: 'index',
      header: 'Index weight',
      width: 100,
      align: 'right',
      render: (name) => percent(fromFraction(name.index), 2)
    },
    {
      key: 'capped',
      header: 'Capped at',
      width: 100,
      align: 'right',
      render: (name) => percent(fromFraction(name.capped), 2)
    }
  ]
}

const UNFILLED_COLUMNS: readonly Column<Unfilled>[] = [
  ...identity<Unfilled>(
    (order) => order.asset_id,
    (order) => {
      const name = order.reference?.name
      return typeof name === 'string' ? name : '—'
    }
  ),
  {
    key: 'requested',
    header: 'Requested',
    width: 90,
    align: 'right',
    render: (order) => quantity(order.requested_quantity),
    value: (order) => order.requested_quantity
  },
  {
    key: 'filled',
    header: 'Filled',
    width: 90,
    align: 'right',
    render: (order) => quantity(order.filled_quantity),
    value: (order) => order.filled_quantity
  },
  {
    key: 'ratio',
    header: 'Filled %',
    width: 70,
    align: 'right',
    render: (order) => percent(fromFraction(fillRatio(order)), 1),
    value: (order) => fromFraction(fillRatio(order))
  },
  {
    key: 'shortfall',
    header: 'Short by',
    width: 90,
    align: 'right',
    render: (order) => <CompactMoney value={order.shortfall_value} />,
    value: (order) => order.shortfall_value
  },
  {
    key: 'reason',
    header: 'Why',
    width: 110,
    render: (order) => order.reason,
    value: (order) => order.reason
  }
]
