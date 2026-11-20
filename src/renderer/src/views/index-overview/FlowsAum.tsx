import { useCallback, useMemo, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { LevelChart } from '../../charts/LevelChart'
import { StackedBarChart } from '../../charts/StackedBarChart'
import { seriesColor } from '../../charts/theme'
import type { Point } from '../../charts/transform'
import { Calculating } from '../../components/Calculating/Calculating'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { isAbsent, useRunResult, type RunResult } from '../shared/beaconQueries'
import {
  fromFraction,
  lastValue,
  percent,
  shortMonth,
  signedPercent,
  toPoints
} from '../shared/indexMetrics'
import { CompactMoney } from '../shared/LargeNumber'
import { formatMoney } from '../shared/largeNumbers'
import { AumByCurrency } from './AumByCurrency'

type Flow = components['schemas']['FlowPayload']

/** A dealing day's flow into one share class, or into the fund when it has none. */
interface ClassFlow extends Flow {
  shareClass: string
}

/** One share class's assets now, in the book's currency, and its share of the fund's. */
interface ClassAssets {
  name: string
  currency: string
  distribution: string
  assets: number | undefined
  share: number | undefined
  totalReturn: number | null | undefined
}

/** Both charts one height, so they stack as a pair (Karan, 2026-11-20). */
const CHART_HEIGHT = 320
/** The flows chart's legend sits above its bars, so its plot is that much shorter. */
const LEGEND_HEIGHT = 14
/** The flows ledger's body, so the table ends about where the chart beside it does. */
const LEDGER_HEIGHT = 264

/**
 * Overview → Flows & AUM (Karan, py-beacon 0.9.1; laid out again
 * 2026-11-20).
 *
 * Where the money went. On the left the fund's assets as a line, and under
 * it each dealing day's flows stacked by share class, a bar per day rather
 * than on a calendar; on the right the assets by class and the flows ledger.
 * An ETF's market quotes are not shown (Karan, 2026-11-20). All from the
 * run's whole payload (`/strategies/{id}/result`); a run with no vehicle
 * and no flows has none of it, and the face says so rather than drawing
 * zeros.
 */
export function FlowsAum({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  const result = useRunResult(strategyId)
  const aum = useMemo(() => assets(result.data), [result.data])
  const flows = useMemo(() => classFlows(result.data), [result.data])

  if (result.isPending) return <Calculating label="Loading" subject="the run" />
  if (result.isError) {
    return isAbsent(result.error) ? (
      <ViewEmpty figure="drawer">This strategy has no run with fund detail yet.</ViewEmpty>
    ) : (
      <ViewError error={result.error} />
    )
  }

  const run = result.data
  const classes = run.share_classes ?? []
  const currency = run.currency ?? ''

  if (aum.length === 0 && classes.length === 0) {
    return (
      <ViewEmpty figure="plot">
        This run had no flows or share classes. Set a vehicle and flows in the backtest to see them
        here.
      </ViewEmpty>
    )
  }

  const byClass = classAssets(run)
  const total = byClass.reduce((sum, row) => sum + (row.assets ?? 0), 0)
  // One colour per class wherever it is drawn, by its place among the classes' names.
  const names = classes.map((shareClass) => shareClass.name).sort()
  const colourOf = (name: string): string => seriesColor(mode, Math.max(names.indexOf(name), 0))

  /*
   * Two rows, each a chart 580 by 320 beside its table (Karan,
   * 2026-11-20): the assets by class next to the assets, the flows ledger
   * next to the flows, set level with the chart and with no heading of its
   * own, since the chart's names it.
   */
  return (
    <div className="flows-aum">
      {aum.length > 0 && (
        <Section title="Assets under management">
          <LevelChart
            mode={mode}
            series={[{ label: `AUM, ${currency}`, points: aum, compact: true }]}
            height={CHART_HEIGHT}
            legend
          />
        </Section>
      )}
      <div className="flows-aum-side">
        {byClass.length > 0 && (
          <Section title="AUM by share class">
            <AumByCurrency
              classes={classes.map((shareClass) => ({
                name: shareClass.name,
                currency: shareClass.currency,
                assets: lastValue(toPoints(shareClass.book_net_assets)),
                hedged: shareClass.hedged
              }))}
              colourOf={colourOf}
            />
            <Table
              columns={CLASS_COLUMNS}
              rows={byClass}
              getRowId={(row) => row.name}
              totalRow={{
                name: 'Fund',
                assets: <CompactMoney value={total} />,
                share: percent(100, 1)
              }}
            />
          </Section>
        )}
      </div>

      {flows.length > 0 && (
        <>
          <Section title="Flows">
            <FlowsChart flows={flows} mode={mode} colourOf={colourOf} />
          </Section>
          <div className="flows-aum-ledger">
            <Table
              columns={FLOW_COLUMNS}
              rows={flows}
              getRowId={(flow) => `${flow.shareClass}:${flow.date}`}
              maxBodyHeight={LEDGER_HEIGHT}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Each dealing day's flows, a bar per day, stacked by share class. */
function FlowsChart({
  flows,
  mode,
  colourOf
}: {
  flows: readonly ClassFlow[]
  mode: ReturnType<typeof useThemeMode>
  colourOf: (name: string) => string
}): ReactElement {
  const dates = [...new Set(flows.map((flow) => flow.date))].sort()
  const names = [...new Set(flows.map((flow) => flow.shareClass))].sort()
  const value = useCallback(
    (date: string, name: string): number =>
      flows
        .filter((flow) => flow.date === date && flow.shareClass === name)
        .reduce((sum, flow) => sum + flow.amount, 0),
    [flows]
  )
  const net = (date: string): number =>
    flows.filter((flow) => flow.date === date).reduce((sum, flow) => sum + flow.amount, 0)

  return (
    <StackedBarChart
      categories={dates}
      series={names.map((name) => ({
        key: name,
        label: name === FUND ? 'Fund' : `Class ${name}`,
        colour: colourOf(name)
      }))}
      value={value}
      mode={mode}
      height={CHART_HEIGHT - LEGEND_HEIGHT}
      format={money}
      tickLabel={shortMonth}
      tipExtra={(date) => (names.length > 1 ? [['Net', money(net(date))]] : [])}
      label="Flows on each dealing day, by share class"
    />
  )
}

/** The name the fund's own flows go under when it has no share classes. */
const FUND = ''

/** Net assets each day: units in issue at the day's NAV per unit. */
function assets(run: RunResult | undefined): Point[] {
  const nav = toPoints(run?.nav_per_unit)
  const units = toPoints(run?.units)
  const byDate = new Map(units.map((point) => [point.date, point.value]))
  return nav.flatMap((point) => {
    const held = byDate.get(point.date)
    return held === undefined ? [] : [{ date: point.date, value: point.value * held }]
  })
}

/** Every share class's flows, in date order; the fund's own when it has no classes. */
function classFlows(run: RunResult | undefined): ClassFlow[] {
  const classes = run?.share_classes ?? []
  const all = classes.some((shareClass) => shareClass.flows.length > 0)
    ? classes.flatMap((shareClass) =>
        shareClass.flows.map((flow) => ({ ...flow, shareClass: shareClass.name }))
      )
    : (run?.flows ?? []).map((flow) => ({ ...flow, shareClass: FUND }))
  return all.sort((one, other) => one.date.localeCompare(other.date))
}

/** Each class's assets on the last day, in the book's currency, and its share. */
function classAssets(run: RunResult): ClassAssets[] {
  const rows = (run.share_classes ?? []).map((shareClass) => ({
    name: shareClass.name,
    currency: `${shareClass.currency}${shareClass.hedged ? ' · hedged' : ''}`,
    distribution: shareClass.distribution,
    assets: lastValue(toPoints(shareClass.book_net_assets)),
    totalReturn: shareClass.metrics.total_return
  }))
  const total = rows.reduce((sum, row) => sum + (row.assets ?? 0), 0)
  return rows.map((row) => ({
    ...row,
    share: row.assets === undefined || total === 0 ? undefined : (row.assets / total) * 100
  }))
}

/** Short money with its own suffix, 2.2M, for the flows chart's axis and hover. */
function money(value: number): string {
  return formatMoney(value, { unit: 'auto', decimals: 1 })
}

const CLASS_COLUMNS: readonly Column<ClassAssets>[] = [
  { key: 'name', header: 'Class', width: 60, emphasis: true, render: (row) => row.name },
  { key: 'currency', header: 'Currency', width: 100, render: (row) => row.currency },
  { key: 'distribution', header: 'Distribution', width: 100, render: (row) => row.distribution },
  {
    key: 'assets',
    header: 'Net assets',
    width: 100,
    align: 'right',
    render: (row) => <CompactMoney value={row.assets} />
  },
  {
    key: 'share',
    header: 'Share',
    width: 70,
    align: 'right',
    render: (row) => percent(row.share, 1)
  },
  {
    key: 'return',
    header: 'Total return',
    width: 90,
    align: 'right',
    render: (row) => signedPercent(fromFraction(row.totalReturn), 2)
  }
]

const FLOW_COLUMNS: readonly Column<ClassFlow>[] = [
  { key: 'date', header: 'Date', width: 90, emphasis: true, render: (flow) => flow.date },
  {
    key: 'class',
    header: 'Class',
    width: 60,
    render: (flow) => (flow.shareClass === FUND ? '—' : flow.shareClass)
  },
  {
    key: 'amount',
    header: 'Amount',
    width: 90,
    align: 'right',
    render: (flow) => <CompactMoney value={flow.amount} />
  },
  {
    key: 'units',
    header: 'Units',
    width: 100,
    align: 'right',
    render: (flow) => flow.units.toLocaleString('en-US', { maximumFractionDigits: 0 })
  },
  {
    key: 'dealing',
    header: 'Dealing price',
    width: 90,
    align: 'right',
    render: (flow) => flow.dealing_price.toFixed(4)
  },
  {
    key: 'adjustment',
    header: 'Paid to the fund',
    width: 110,
    align: 'right',
    render: (flow) => <CompactMoney value={flow.adjustment} />
  }
]
