import { useMemo, type ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { LevelChart } from '../../charts/LevelChart'
import type { Point } from '../../charts/transform'
import { Section } from '../../components/Section/Section'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { isAbsent, useRunResult, type RunResult } from '../shared/beaconQueries'
import { fromFraction, lastValue, percent, signedPercent, toPoints } from '../shared/indexMetrics'
import { CompactMoney } from '../shared/LargeNumber'

type Flow = components['schemas']['FlowPayload']
type ShareClass = components['schemas']['ShareClassPayload']

/**
 * Overview → Flows & AUM (Karan, py-beacon 0.9.1).
 *
 * Where the money went: assets under management, units in issue and the
 * price they were dealt at, the flows ledger, fees, each share class in its
 * own currency, and an ETF's market quotes. All from the run's whole payload
 * (`/strategies/{id}/result`); a run with no vehicle and no flows has none
 * of it, and the face says so rather than drawing zeros.
 */
export function FlowsAum({ strategyId }: { strategyId: string }): ReactElement {
  const mode = useThemeMode()
  const result = useRunResult(strategyId)

  const nav = useMemo(() => toPoints(result.data?.nav_per_unit), [result.data])
  const aum = useMemo(() => assets(result.data), [result.data])

  if (result.isPending) return <ViewLoading what="the run" />
  if (result.isError) {
    return isAbsent(result.error) ? (
      <ViewEmpty figure="drawer">This strategy has no run with fund detail yet.</ViewEmpty>
    ) : (
      <ViewError error={result.error} />
    )
  }

  const run = result.data
  const flows = run.flows ?? []
  const classes = run.share_classes ?? []
  const net = flows.reduce((sum, flow) => sum + flow.amount, 0)

  if (nav.length === 0 && classes.length === 0 && run.market == null) {
    return (
      <ViewEmpty figure="plot">
        This run had no flows, share classes or market. Set a vehicle and flows in the backtest to
        see them here.
      </ViewEmpty>
    )
  }

  return (
    <>
      <StatStrip>
        <Stat label="AUM" value={<CompactMoney value={lastValue(aum)} />} />
        <Stat label="NAV PER UNIT" value={lastValue(nav)?.toFixed(4) ?? '—'} />
        <Stat
          label="NET FLOWS"
          value={<CompactMoney value={net} />}
          tone={net < 0 ? 'negative' : 'default'}
        />
        <Stat label="FEES PAID" value={<CompactMoney value={run.fees_paid} />} />
        <Stat
          label="MONEY-WEIGHTED"
          value={signedPercent(fromFraction(run.metrics.money_weighted_return))}
        />
      </StatStrip>

      {aum.length > 0 && (
        <LevelChart
          mode={mode}
          series={[{ label: 'NAV per unit', points: nav }]}
          panels={[{ label: 'AUM', series: [{ points: aum, kind: 'area' }] }]}
          note={`${String(flows.length)} flows · ${run.currency ?? ''}`}
          height={420}
        />
      )}

      {flows.length > 0 && (
        <Section title="Flows">
          <Table
            columns={FLOW_COLUMNS}
            rows={flows}
            getRowId={(flow) => flow.date}
            maxBodyHeight={320}
          />
        </Section>
      )}

      {classes.length > 0 && (
        <Section title="Share classes">
          <Table
            columns={CLASS_COLUMNS}
            rows={classes}
            getRowId={(shareClass) => shareClass.name}
          />
        </Section>
      )}

      {run.market != null && (
        <Section title="Market">
          <SummaryLine
            items={[
              {
                label: 'market return',
                value: signedPercent(fromFraction(run.metrics.market_return))
              },
              {
                label: 'average premium',
                value: percent(fromFraction(run.metrics.average_premium), 2)
              },
              {
                label: 'average spread',
                value: percent(fromFraction(run.metrics.average_spread), 2)
              },
              {
                label: 'days at a premium',
                value: percent(fromFraction(run.metrics.days_at_premium))
              }
            ]}
          />
        </Section>
      )}
    </>
  )
}

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

const FLOW_COLUMNS: readonly Column<Flow>[] = [
  { key: 'date', header: 'Date', width: 110, emphasis: true, render: (flow) => flow.date },
  {
    key: 'amount',
    header: 'Amount',
    width: 120,
    align: 'right',
    render: (flow) => <CompactMoney value={flow.amount} />
  },
  {
    key: 'nav',
    header: 'NAV per unit',
    width: 110,
    align: 'right',
    render: (flow) => flow.nav_per_unit.toFixed(4)
  },
  {
    key: 'units',
    header: 'Units',
    width: 110,
    align: 'right',
    render: (flow) => flow.units.toLocaleString('en-US', { maximumFractionDigits: 0 })
  },
  {
    key: 'dealing',
    header: 'Dealing price',
    width: 110,
    align: 'right',
    render: (flow) => flow.dealing_price.toFixed(4)
  },
  {
    key: 'adjustment',
    header: 'Paid to the fund',
    width: 120,
    align: 'right',
    render: (flow) => <CompactMoney value={flow.adjustment} />
  }
]

const CLASS_COLUMNS: readonly Column<ShareClass>[] = [
  { key: 'name', header: 'Class', width: 90, emphasis: true, render: (row) => row.name },
  {
    key: 'currency',
    header: 'Currency',
    width: 110,
    render: (row) => `${row.currency}${row.hedged ? ' · hedged' : ''}`
  },
  { key: 'distribution', header: 'Distribution', width: 110, render: (row) => row.distribution },
  {
    key: 'nav',
    header: 'NAV per unit',
    width: 110,
    align: 'right',
    render: (row) => lastValue(toPoints(row.nav_per_unit))?.toFixed(4) ?? '—'
  },
  {
    key: 'assets',
    header: 'Net assets',
    width: 120,
    align: 'right',
    render: (row) => <CompactMoney value={lastValue(toPoints(row.net_assets))} />
  },
  {
    key: 'return',
    header: 'Total return',
    width: 100,
    align: 'right',
    render: (row) => signedPercent(fromFraction(row.metrics.total_return), 2)
  },
  {
    key: 'difference',
    header: 'Tracking diff.',
    width: 100,
    align: 'right',
    render: (row) => signedPercent(fromFraction(row.metrics.tracking_difference), 2)
  },
  {
    key: 'hedges',
    header: 'Hedge trades',
    width: 100,
    align: 'right',
    render: (row) => (row.hedged ? String((row.hedges ?? []).length) : '—')
  }
]
