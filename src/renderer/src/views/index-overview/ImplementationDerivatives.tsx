import type { ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import { LevelChart, type ChartEvent } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import type { ThemeMode } from '../../tokens/tokens'
import type { RunResult } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'
import { CompactMoney } from '../shared/LargeNumber'
import { quantity, sum } from './implementationRows'

type FuturesRoll = components['schemas']['FuturesRollPayload']
type SwapReset = components['schemas']['SwapResetPayload']
type Hedge = components['schemas']['HedgePayload']

/** A forward and the share class it hedges into. */
interface Forward extends Hedge {
  shareClass: string
}

/** One height for every derivatives chart, so the charts side by side line up. */
const CHART_HEIGHT = 260
/** The tables under them, about a dozen rows before they scroll. */
const TABLE_HEIGHT = 264

/**
 * What stood in for stock: index futures (on the uninvested cash, or as the
 * whole replication), a synthetic fund's swap, and a hedged class's
 * forwards. Each a chart of its own, since they are in different units,
 * named by its legend, with its record in a table under it that starts on
 * the chart's y-axis line; side by side, two to a row (Karan, 2026-11-20).
 */
export function Derivatives({ run, mode }: { run: RunResult; mode: ThemeMode }): ReactElement {
  const futures = toPoints(run.futures_exposure).map(asPercent)
  const swap = toPoints(run.swap_value)
  const exposure = toPoints(run.counterparty_exposure).map(asPercent)
  const hedges = toPoints(run.hedge_value)
  const rolls = run.futures_rolls ?? []
  const resets = run.swap_resets ?? []
  const forwards = forwardsOf(run)
  const currency = run.currency ?? ''

  return (
    <div className="implementation-derivatives">
      {futures.length > 0 && (
        <Section title="Index futures">
          <LevelChart
            mode={mode}
            series={[{ label: 'Futures exposure, % of NAV', points: futures }]}
            events={rolls.map((roll): ChartEvent => ({ date: roll.date, text: 'roll' }))}
            note={`${String(rolls.length)} rolls · cost ${money(sum(rolls, (roll) => roll.cost))}`}
            height={CHART_HEIGHT}
            legend
            footer={
              <Table
                columns={ROLL_COLUMNS}
                rows={rolls}
                getRowId={(roll) => roll.date}
                maxBodyHeight={TABLE_HEIGHT}
              />
            }
          />
        </Section>
      )}

      {swap.length > 0 && (
        <Section title="Swap">
          <LevelChart
            mode={mode}
            series={[{ label: `Value owed to the fund, ${currency}`, points: swap }]}
            panels={[
              {
                label: 'counterparty exposure · % of NAV',
                series: [{ points: exposure, kind: 'area' }]
              }
            ]}
            events={resets.map((reset): ChartEvent => ({ date: reset.date, text: reset.reason }))}
            note={`${String(resets.length)} resets`}
            height={CHART_HEIGHT}
            legend
            footer={
              <Table
                columns={RESET_COLUMNS}
                rows={resets}
                getRowId={(reset) => reset.date}
                maxBodyHeight={TABLE_HEIGHT}
              />
            }
          />
        </Section>
      )}

      {hedges.length > 0 && (
        <Section title="Share-class hedges">
          <LevelChart
            mode={mode}
            series={[{ label: `Forwards value, ${currency}`, points: hedges }]}
            note={`${String(forwards.length)} forwards`}
            height={CHART_HEIGHT}
            legend
            // The forwards behind the line: each opened, rolled or reset to its band.
            footer={
              <Table
                columns={FORWARD_COLUMNS}
                rows={forwards}
                getRowId={(forward) => `${forward.shareClass}:${forward.date}`}
                maxBodyHeight={TABLE_HEIGHT}
              />
            }
          />
        </Section>
      )}
    </div>
  )
}

/** Every hedged class's forwards, in date order. */
function forwardsOf(run: RunResult): Forward[] {
  return (run.share_classes ?? [])
    .flatMap((shareClass) =>
      (shareClass.hedges ?? []).map((hedge) => ({ ...hedge, shareClass: shareClass.name }))
    )
    .sort((one, other) => one.date.localeCompare(other.date))
}

function asPercent(point: { date: string; value: number }): { date: string; value: number } {
  return { date: point.date, value: point.value * 100 }
}

function money(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** What a forward was: py-beacon's 'open', 'roll' and 'band', in words. */
const FORWARD_EVENTS: Record<string, string> = {
  open: 'Opened',
  roll: 'Rolled',
  band: 'Back to band'
}

const ROLL_COLUMNS: readonly Column<FuturesRoll>[] = [
  { key: 'date', header: 'Rolled', width: 90, emphasis: true, render: (roll) => roll.date },
  { key: 'expiry', header: 'Into expiry', width: 90, render: (roll) => roll.expiry },
  {
    key: 'contracts',
    header: 'Contracts',
    width: 80,
    align: 'right',
    render: (roll) => quantity(roll.contracts)
  },
  {
    key: 'price',
    header: 'Price',
    width: 70,
    align: 'right',
    render: (roll) => roll.price.toFixed(2)
  },
  // Contracts × price × multiplier is the notional (py-beacon 0.9.7).
  {
    key: 'multiplier',
    header: 'Multiplier',
    width: 60,
    align: 'right',
    render: (roll) => String(roll.multiplier)
  },
  {
    key: 'notional',
    header: 'Notional',
    width: 90,
    align: 'right',
    render: (roll) => <CompactMoney value={roll.notional} />
  },
  {
    key: 'cost',
    header: 'Cost',
    width: 80,
    align: 'right',
    render: (roll) => <CompactMoney value={roll.cost} />
  }
]

const RESET_COLUMNS: readonly Column<SwapReset>[] = [
  { key: 'date', header: 'Reset', width: 90, emphasis: true, render: (reset) => reset.date },
  { key: 'reason', header: 'Why', width: 100, render: (reset) => reset.reason },
  {
    key: 'settled',
    header: 'Settled',
    width: 100,
    align: 'right',
    render: (reset) => <CompactMoney value={reset.settled} />
  },
  {
    key: 'notional',
    header: 'New notional',
    width: 110,
    align: 'right',
    render: (reset) => <CompactMoney value={reset.notional} />
  }
]

const FORWARD_COLUMNS: readonly Column<Forward>[] = [
  { key: 'date', header: 'Date', width: 90, emphasis: true, render: (row) => row.date },
  { key: 'class', header: 'Class', width: 60, render: (row) => row.shareClass },
  {
    key: 'event',
    header: 'Event',
    width: 100,
    render: (row) => FORWARD_EVENTS[row.reason] ?? row.reason
  },
  {
    key: 'notional',
    header: 'Notional',
    width: 90,
    align: 'right',
    render: (row) => <CompactMoney value={row.notional} />
  },
  { key: 'rate', header: 'Rate', width: 70, align: 'right', render: (row) => row.rate.toFixed(4) },
  {
    key: 'settled',
    header: 'Settled',
    width: 90,
    align: 'right',
    // Nothing settles when a forward is first opened.
    render: (row) => (row.reason === 'open' ? '—' : <CompactMoney value={row.settled} />)
  }
]
