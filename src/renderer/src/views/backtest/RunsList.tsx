import { useMemo, type ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { relativeTime } from '../home/activityRows'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useBacktestRecords } from '../shared/beaconQueries'
import { describeSkipped } from '../shared/pickers'
import type { BacktestRecordRow } from '../shared/indexSuggestions'

/**
 * The Backtest tab with no strategy named: every run the engine kept
 * (Karan, 0.9.0). One row a strategy — the engine keeps the latest run of
 * each — newest first, and a row opens that strategy's setup, ready to run
 * again or to change.
 */
export function RunsList({ onOpen }: { onOpen: (strategyId: string) => void }): ReactElement {
  const runs = useBacktestRecords()
  const now = Date.now()

  const rows = useMemo(
    () => [...(runs.data?.backtests ?? [])].sort((a, b) => stamp(b) - stamp(a)),
    [runs.data]
  )
  const columns = useMemo(() => columnsAt(now), [now])

  if (runs.isPending) return <ViewLoading what="the runs" />
  if (runs.isError) return <ViewError error={runs.error} />
  if (rows.length === 0) {
    return (
      <ViewEmpty figure="cardindex">
        No backtests have been run yet. Type the name of a saved strategy above to set one up.
      </ViewEmpty>
    )
  }

  const skipped = describeSkipped({
    skipped: runs.data.skipped,
    skipped_causes: runs.data.skipped_causes ?? null
  })

  return (
    <Section title={`Runs · ${String(rows.length)}`} className="backtest-runs">
      <Table
        columns={columns}
        rows={rows}
        getRowId={(row) => row.strategy_id}
        onSelectRow={(row) => {
          onOpen(row.strategy_id)
        }}
        maxBodyHeight={560}
      />
      {skipped !== undefined && <p className="backtest-note type-11">{skipped}</p>}
    </Section>
  )
}

/** When it ran, for sorting; a run from before py-beacon stamped them sorts last. */
function stamp(row: BacktestRecordRow): number {
  const at = row.run_at == null ? Number.NaN : Date.parse(row.run_at)
  return Number.isNaN(at) ? 0 : at
}

function columnsAt(now: number): Column<BacktestRecordRow>[] {
  return [
    {
      key: 'strategy',
      header: 'Strategy',
      width: 150,
      emphasis: true,
      render: (row) => row.strategy_id
    },
    { key: 'name', header: 'Name', width: 220, minWidth: 140, render: (row) => row.strategy_name },
    { key: 'index', header: 'Index', width: 120, render: (row) => row.index_id },
    { key: 'kind', header: 'Kind', width: 120, render: (row) => row.strategy ?? '—' },
    {
      key: 'vehicle',
      header: 'Vehicle',
      width: 150,
      render: (row) => row.vehicle ?? row.vehicle_preset ?? 'plain'
    },
    { key: 'currency', header: 'Currency', width: 80, render: (row) => row.currency ?? '—' },
    {
      key: 'ran',
      header: 'Last run',
      width: 120,
      // Unstamped runs predate BN-162: "back-tested" is what is known.
      render: (row) => (stamp(row) === 0 ? 'back-tested' : relativeTime(stamp(row), now))
    }
  ]
}
