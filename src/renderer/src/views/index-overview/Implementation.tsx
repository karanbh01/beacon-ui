import { useMemo, useState, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { Calculating } from '../../components/Calculating/Calculating'
import { Section } from '../../components/Section/Section'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { ChevronIcon } from '../../icons/generated'
import { useThemeMode } from '../../state/theme'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { isAbsent, useRunResult } from '../shared/beaconQueries'
import { fromFraction, percent } from '../shared/indexMetrics'
import { CompactMoney, Count } from '../shared/LargeNumber'
import { holdingColumns, useReferenceColumns } from '../shared/holdingColumns'
import { HoldingColumnsButton } from '../shared/HoldingColumnsButton'
import { useBacktestOptions, type BacktestOptions } from '../shared/strategyDocuments'
import { rebalanceNames, stepRows, sum, type StepRow } from './implementationRows'
import { Derivatives } from './ImplementationDerivatives'
import { RebalanceChart } from './RebalanceChart'
import { RebalanceDetail } from './RebalanceDetail'

type PriceGap = components['schemas']['PriceGapPayload']
type Replication = components['schemas']['ReplicationPayload']
type ActiveStep = components['schemas']['ActiveStepPayload']

/**
 * Overview → Implementation (Karan, py-beacon 0.9.1).
 *
 * The distance between the index and what the fund could actually hold:
 * what the screens took out, the caps cut down and the orders left unfilled
 * at each rebalance (under it, a click away, and charted beside it), the
 * days priced from a stale quote, and the derivatives that stood in for
 * stock. Every table is the run's own record (`/strategies/{id}/result`);
 * each one appears only when the run has something in it, since a plain
 * index run has none of them.
 */
export function Implementation({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  // One choice for both of its holdings tables, which come from one request.
  const reference = useReferenceColumns(TABLE)
  const result = useRunResult(strategyId, reference.fields)
  const options = useBacktestOptions()
  const labelOf = useMemo(() => stageLabels(options.data), [options.data])
  const [opened, setOpened] = useState<string | undefined>(undefined)

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

  if (result.isPending) return <Calculating label="Loading" subject="the run" />
  if (result.isError) {
    return isAbsent(result.error) ? (
      <ViewEmpty figure="drawer">
        This strategy has no run yet. Backtest it to see how it was implemented.
      </ViewEmpty>
    ) : (
      <ViewError error={result.error} />
    )
  }

  const run = result.data
  const toggle = (date: string): void => {
    setOpened((current) => (current === date ? undefined : date))
  }
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

      {/*
        A rebalance's removed, capped and unfilled names open under it,
        rather than as a table of every order in the run, and the counts and
        cash are charted beside it (Karan, 2026-11-20).
      */}
      <Section title="Rebalances">
        <div className="implementation-rebalances">
          <Table
            columns={stepColumns(steps, opened)}
            rows={steps}
            getRowId={(row) => row.date}
            onSelectRow={(row) => {
              if (!hasNames(row)) return
              toggle(row.date)
            }}
            {...(opened === undefined ? {} : { expandedId: opened })}
            renderExpanded={(row) => {
              const step = run.rebalance_steps?.find((each) => each.date === row.date)
              if (step === undefined) return undefined
              const snapshot = run.rebalances?.find((each) => each.date === row.date)
              return (
                <RebalanceDetail
                  date={row.date}
                  {...rebalanceNames(step, snapshot, labelOf)}
                  unfilled={unfilled.filter((order) => order.date === row.date)}
                />
              )
            }}
            maxBodyHeight={520}
          />
          {steps.length > 0 && (
            <RebalanceChart
              steps={steps}
              mode={mode}
              height={290}
              opened={opened}
              onSelect={toggle}
            />
          )}
        </div>
      </Section>

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
            queryable
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

/**
 * The rebalances' columns. "Priced from" only when a rebalance was priced
 * from an earlier session, as it is blank for every other (Karan,
 * 2026-11-20).
 */
function stepColumns(
  steps: readonly StepRow[],
  opened: string | undefined
): readonly Column<StepRow>[] {
  const stale = steps.some((row) => row.pricedFrom !== undefined)
  return [
    ...STEP_COLUMNS.filter((column) => stale || column.key !== 'priced'),
    {
      key: 'open',
      header: '',
      width: 12,
      render: (row) => (hasNames(row) ? <OpenChevron open={row.date === opened} /> : null)
    }
  ]
}

/** Whether a rebalance has any names to open: removed, capped or unfilled. */
function hasNames(row: StepRow): boolean {
  return row.removed + row.capped + row.unfilled > 0
}

/** Points down to open a rebalance's names, up to close them. */
function OpenChevron({ open }: { open: boolean }): ReactElement {
  return (
    <ChevronIcon
      size={10}
      className={
        open ? 'implementation-chevron implementation-chevron-open' : 'implementation-chevron'
      }
    />
  )
}

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
  { key: 'by', header: 'By', width: 260, render: (row) => row.removedBy },
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

const GAP_DATE: Column<PriceGap> = {
  key: 'date',
  header: 'Day',
  width: 110,
  render: (gap) => gap.date,
  value: (gap) => gap.date
}

const GAP_COLUMNS: readonly Column<PriceGap>[] = [
  {
    key: 'from',
    header: 'Priced from',
    width: 110,
    render: (gap) => gap.priced_from,
    value: (gap) => gap.priced_from
  }
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
