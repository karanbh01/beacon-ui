import { useMemo, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { LevelChart, type ChartEvent } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import type { ThemeMode } from '../../tokens/tokens'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { isAbsent, useRunResult, type RunResult } from '../shared/beaconQueries'
import { fromFraction, percent, toPoints } from '../shared/indexMetrics'
import { CompactMoney, Count } from '../shared/LargeNumber'
import { holdingColumns, useReferenceColumns } from '../shared/holdingColumns'
import { HoldingColumnsButton } from '../shared/HoldingColumnsButton'
import { useBacktestOptions, type BacktestOptions } from '../shared/strategyDocuments'
import { fillRatio, stepRows, type StepRow } from './implementationRows'

type Unfilled = components['schemas']['UnfilledOrderPayload']
type PriceGap = components['schemas']['PriceGapPayload']
type Replication = components['schemas']['ReplicationPayload']
type ActiveStep = components['schemas']['ActiveStepPayload']
type FuturesRoll = components['schemas']['FuturesRollPayload']
type SwapReset = components['schemas']['SwapResetPayload']

/**
 * Overview → Implementation (Karan, py-beacon 0.9.1).
 *
 * The distance between the index and what the fund could actually hold:
 * what the screens took out and the caps cut down at each rebalance, the
 * orders that did not fill, the days priced from a stale quote, and the
 * derivatives that stood in for stock. Every table is the run's own record
 * (`/strategies/{id}/result`); each one appears only when the run has
 * something in it, since a plain index run has none of them.
 */
export function Implementation({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  // One choice for both of its holdings tables, which come from one request.
  const reference = useReferenceColumns(TABLE)
  const result = useRunResult(strategyId, reference.fields)
  const options = useBacktestOptions()
  const labelOf = useMemo(() => stageLabels(options.data), [options.data])

  const steps = useMemo(
    () =>
      result.data === undefined
        ? []
        : stepRows(
            result.data.rebalance_steps ?? [],
            result.data.rebalance_pricing ?? [],
            result.data.unfilled ?? [],
            labelOf
          ),
    [result.data, labelOf]
  )

  if (result.isPending) return <ViewLoading what="the run" />
  if (result.isError) {
    return isAbsent(result.error) ? (
      <ViewEmpty>This strategy has no run to read the implementation of yet.</ViewEmpty>
    ) : (
      <ViewError error={result.error} />
    )
  }

  const run = result.data
  const unfilled = run.unfilled ?? []
  const gaps = run.price_gaps ?? []
  const replication = run.replication ?? []
  const active = run.active ?? []

  return (
    <>
      <StatStrip>
        <Stat label="REBALANCES" value={String(steps.length)} />
        <Stat label="NAMES REMOVED" value={String(sum(steps, (row) => row.removed))} />
        <Stat label="NAMES CAPPED" value={String(sum(steps, (row) => row.capped))} />
        <Stat
          label="AVERAGE CASH"
          value={percent(
            fromFraction(sum(steps, (row) => row.cashWeight) / (steps.length || 1)),
            2
          )}
        />
        <Stat
          label="UNFILLED ORDERS"
          value={String(unfilled.length)}
          tone={unfilled.length > 0 ? 'negative' : 'default'}
        />
        <Stat label="TRADING COSTS" value={<CompactMoney value={run.total_costs} />} />
      </StatStrip>

      <Section title="Rebalances">
        <Table
          columns={STEP_COLUMNS}
          rows={steps}
          getRowId={(row) => row.date}
          maxBodyHeight={320}
        />
      </Section>

      {unfilled.length > 0 && (
        <Section title={`Unfilled orders · ${String(unfilled.length)}`}>
          <Table
            columns={[
              UNFILLED_DATE,
              ...holdingColumns<Unfilled>(
                (order) => order.asset_id,
                (order) => order.reference,
                reference.columns
              ),
              ...UNFILLED_COLUMNS
            ]}
            headerAction={<HoldingColumnsButton table={TABLE} />}
            rows={unfilled}
            getRowId={(order) => `${order.date}:${order.asset_id}`}
            maxBodyHeight={320}
          />
        </Section>
      )}

      {/*
        A stale mark is otherwise invisible in the NAV (BN-226), so the
        table says so even when short: one carried-forward price is the
        reason a day's return looks wrong.
      */}
      {gaps.length > 0 && (
        <Section title={`Priced from an earlier session · ${String(gaps.length)}`}>
          <Table
            columns={[
              GAP_DATE,
              ...holdingColumns<PriceGap>(
                (gap) => gap.asset_id,
                (gap) => gap.reference,
                reference.columns
              ),
              ...GAP_COLUMNS
            ]}
            headerAction={<HoldingColumnsButton table={TABLE} />}
            rows={gaps}
            getRowId={(gap) => `${gap.date}:${gap.asset_id}`}
            maxBodyHeight={240}
          />
        </Section>
      )}

      {replication.length > 0 && (
        <Section title="Replication">
          <Table columns={REPLICATION_COLUMNS} rows={replication} getRowId={(row) => row.date} />
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Active portfolio">
          <Table columns={ACTIVE_COLUMNS} rows={active} getRowId={(row) => row.date} />
        </Section>
      )}

      <Derivatives run={run} mode={mode} />
    </>
  )
}

/**
 * What stood in for stock: index futures (on the uninvested cash, or as the
 * whole replication), a synthetic fund's swap, and a hedged class's
 * forwards. Each as its own chart, since they are in different units —
 * exposure as a share of NAV, the others in money — with its rolls or
 * resets flagged on the line.
 */
function Derivatives({ run, mode }: { run: RunResult; mode: ThemeMode }): ReactElement {
  const futures = toPoints(run.futures_exposure).map(asPercent)
  const swap = toPoints(run.swap_value)
  const exposure = toPoints(run.counterparty_exposure).map(asPercent)
  const hedges = toPoints(run.hedge_value)
  const rolls = run.futures_rolls ?? []
  const resets = run.swap_resets ?? []

  return (
    <>
      {futures.length > 0 && (
        <Section title="Index futures">
          <LevelChart
            mode={mode}
            series={[{ label: 'exposure · % of NAV', points: futures }]}
            events={rolls.map((roll): ChartEvent => ({ date: roll.date, text: 'roll' }))}
            note={`${String(rolls.length)} rolls · cost ${money(sum(rolls, (roll) => roll.cost))}`}
            height={260}
          />
          <Table columns={ROLL_COLUMNS} rows={rolls} getRowId={(roll) => roll.date} />
        </Section>
      )}

      {swap.length > 0 && (
        <Section title="Swap">
          <LevelChart
            mode={mode}
            series={[{ label: 'value owed to the fund', points: swap }]}
            panels={[
              {
                label: 'counterparty exposure · % of NAV',
                series: [{ points: exposure, kind: 'area' }]
              }
            ]}
            events={resets.map((reset): ChartEvent => ({ date: reset.date, text: reset.reason }))}
            note={`${String(resets.length)} resets`}
            height={320}
          />
          <Table columns={RESET_COLUMNS} rows={resets} getRowId={(reset) => reset.date} />
        </Section>
      )}

      {hedges.length > 0 && (
        <Section title="Share-class hedges">
          <LevelChart
            mode={mode}
            series={[{ label: 'forwards value', points: hedges }]}
            {...(run.currency == null ? {} : { note: run.currency })}
            height={220}
          />
        </Section>
      )}
    </>
  )
}

/** A stage's own label from `/backtest/options`: "Minimum price", not its class name. */
function stageLabels(options: BacktestOptions | undefined): (stage: string) => string {
  const labels = new Map(
    [...(options?.screens ?? []), ...(options?.caps ?? [])].map((option) => [
      option.name,
      option.label
    ])
  )
  return (stage) => labels.get(stage) ?? stage
}

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}

function asPercent(point: { date: string; value: number }): { date: string; value: number } {
  return { date: point.date, value: point.value * 100 }
}

function money(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const quantity = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 0 })

const STEP_COLUMNS: readonly Column<StepRow>[] = [
  { key: 'date', header: 'Rebalance', width: 110, emphasis: true, render: (row) => row.date },
  {
    key: 'priced',
    header: 'Priced from',
    width: 110,
    // Blank on an ordinary day: the case worth reading is the other one.
    render: (row) => row.pricedFrom ?? ''
  },
  {
    key: 'removed',
    header: 'Removed',
    width: 90,
    align: 'right',
    render: (row) => String(row.removed)
  },
  { key: 'by', header: 'By', width: 220, minWidth: 160, render: (row) => row.removedBy },
  {
    key: 'capped',
    header: 'Capped',
    width: 80,
    align: 'right',
    render: (row) => String(row.capped)
  },
  {
    key: 'cash',
    header: 'Cash',
    width: 80,
    align: 'right',
    render: (row) => percent(fromFraction(row.cashWeight), 2)
  },
  {
    key: 'unfilled',
    header: 'Unfilled',
    width: 80,
    align: 'right',
    render: (row) => (row.unfilled === 0 ? '—' : String(row.unfilled))
  }
]

/** The column choice for both holdings tables, under Asset → Holding columns. */
const TABLE = 'implementation'

/* The date, then the holding (holdingColumns), then what happened to it. */
const UNFILLED_DATE: Column<Unfilled> = {
  key: 'date',
  header: 'Rebalance',
  width: 110,
  render: (order) => order.date
}

const UNFILLED_COLUMNS: readonly Column<Unfilled>[] = [
  {
    key: 'requested',
    header: 'Requested',
    width: 110,
    align: 'right',
    render: (order) => quantity(order.requested_quantity)
  },
  {
    key: 'filled',
    header: 'Filled',
    width: 110,
    align: 'right',
    render: (order) => quantity(order.filled_quantity)
  },
  {
    key: 'ratio',
    header: 'Filled %',
    width: 80,
    align: 'right',
    render: (order) => percent(fromFraction(fillRatio(order)), 1)
  },
  {
    key: 'shortfall',
    header: 'Short by',
    width: 110,
    align: 'right',
    render: (order) => <CompactMoney value={order.shortfall_value} />
  },
  { key: 'reason', header: 'Why', width: 120, render: (order) => order.reason }
]

const GAP_DATE: Column<PriceGap> = {
  key: 'date',
  header: 'Day',
  width: 110,
  render: (gap) => gap.date
}

const GAP_COLUMNS: readonly Column<PriceGap>[] = [
  { key: 'from', header: 'Priced from', width: 110, render: (gap) => gap.priced_from }
]

const REPLICATION_COLUMNS: readonly Column<Replication>[] = [
  { key: 'date', header: 'Rebalance', width: 110, emphasis: true, render: (row) => row.date },
  {
    key: 'holdings',
    header: 'Holdings',
    width: 90,
    align: 'right',
    render: (row) => <Count value={row.holdings} />
  },
  {
    key: 'te',
    header: 'Tracking error',
    width: 110,
    align: 'right',
    render: (row) => percent(fromFraction(row.tracking_error), 2)
  },
  {
    key: 'unmeasured',
    header: 'Held at index weight',
    width: 150,
    align: 'right',
    render: (row) => String((row.unmeasured ?? []).length)
  }
]

const ACTIVE_COLUMNS: readonly Column<ActiveStep>[] = [
  { key: 'date', header: 'Rebalance', width: 110, emphasis: true, render: (row) => row.date },
  {
    key: 'holdings',
    header: 'Holdings',
    width: 90,
    align: 'right',
    render: (row) => String(Object.keys(row.weights).length)
  },
  {
    key: 'share',
    header: 'Active share',
    width: 100,
    align: 'right',
    render: (row) => percent(fromFraction(row.active_share), 1)
  },
  {
    key: 'te',
    header: 'Tracking error',
    width: 110,
    align: 'right',
    render: (row) => percent(fromFraction(row.tracking_error), 2)
  }
]

const ROLL_COLUMNS: readonly Column<FuturesRoll>[] = [
  { key: 'date', header: 'Rolled', width: 110, emphasis: true, render: (roll) => roll.date },
  { key: 'expiry', header: 'Into expiry', width: 110, render: (roll) => roll.expiry },
  {
    key: 'contracts',
    header: 'Contracts',
    width: 110,
    align: 'right',
    render: (roll) => quantity(roll.contracts)
  },
  {
    key: 'price',
    header: 'Price',
    width: 90,
    align: 'right',
    render: (roll) => roll.price.toFixed(2)
  },
  {
    key: 'notional',
    header: 'Notional',
    width: 120,
    align: 'right',
    render: (roll) => <CompactMoney value={roll.notional} />
  },
  {
    key: 'cost',
    header: 'Cost',
    width: 100,
    align: 'right',
    render: (roll) => <CompactMoney value={roll.cost} />
  }
]

const RESET_COLUMNS: readonly Column<SwapReset>[] = [
  { key: 'date', header: 'Reset', width: 110, emphasis: true, render: (reset) => reset.date },
  { key: 'reason', header: 'Why', width: 100, render: (reset) => reset.reason },
  {
    key: 'settled',
    header: 'Settled',
    width: 120,
    align: 'right',
    render: (reset) => <CompactMoney value={reset.settled} />
  },
  {
    key: 'notional',
    header: 'New notional',
    width: 130,
    align: 'right',
    render: (reset) => <CompactMoney value={reset.notional} />
  }
]
