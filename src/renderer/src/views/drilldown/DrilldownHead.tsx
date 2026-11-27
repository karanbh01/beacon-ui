import { useMemo, type ReactElement } from 'react'
import type { SeriesMarkerShape } from 'lightweight-charts'
import type { StatisticSpec } from '../../api/analytics'
import { LevelChart, type ChartEvent } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { useThemeMode } from '../../state/theme'
import { frameOf } from '../index-overview/analyticsFrames'
import { HoverTip } from '../index-overview/HoverTip'
import { useComparators } from '../index-overview/comparators'
import { StyleBox } from '../index-overview/StyleBox'
import '../index-overview/SummaryProfile.css'
import { useAnalysisOptions, useAnalytics } from '../shared/analyticsQueries'
import type { AssetView, InstrumentProfile } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'
import {
  cellText,
  columnOf,
  currenciesOf,
  dayOf,
  eventAmount,
  inCurrency,
  latestWith,
  numberIn,
  partOf,
  type Part
} from './profile'
import { ActiveWeights } from './ActiveWeights'
import { RebalanceWeights } from './RebalanceWeights'
import { WeightHistogram } from './WeightHistogram'

/** Each event's mark on the chart: up into a portfolio, down out of one. */
const SHAPES: Record<string, SeriesMarkerShape> = {
  added_to_fund: 'arrowUp',
  added_to_index: 'arrowUp',
  removed_from_fund: 'arrowDown',
  removed_from_index: 'arrowDown',
  screened_out: 'arrowDown',
  capped: 'square'
}

/**
 * The top of Drilldown, the same on every face (Karan, 2026-11-26): on the
 * left what the name is (its name, its box in words, its key data and how
 * the fund has held it, then side by side how long each portfolio held it
 * at each weight and the fund's active weight each day, and where it sits in
 * the style box and has sat over the run, 2026-11-27); on the right its
 * price with its daily weight under it and what happened to it marked along
 * the line, then its weights at the latest rebalances.
 */
export function DrilldownHead({
  strategyId,
  identifier,
  profile,
  asset
}: {
  strategyId: string
  identifier: string
  profile: InstrumentProfile | undefined
  asset: AssetView | undefined
}): ReactElement {
  const mode = useThemeMode()
  const analytics = useAnalytics(strategyId)
  const options = useAnalysisOptions()
  const { benchmarkIsIndex } = useComparators(strategyId)
  const answer = analytics.data?.status === 'computed' ? analytics.data.analytics : undefined
  const specOf = (id: string): StatisticSpec | undefined =>
    options.data?.statistics.find((statistic) => statistic.id === id)

  const daily = partOf(profile, 'daily_weights')
  const style = partOf(profile, 'style')
  const currency = profile?.currency ?? ''
  const money = currenciesOf(asset)
  const latestStyle = latestWith(style, 'size_position')
  const place =
    latestStyle === undefined
      ? undefined
      : {
          label: identifier,
          size: numberIn(latestStyle, 'size_position') ?? 0,
          style: numberIn(latestStyle, 'style_position') ?? 0
        }
  const trail = (style?.rows ?? []).flatMap((row) => {
    const size = numberIn(row, 'size_position')
    const across = numberIn(row, 'style_position')
    return size === undefined || across === undefined ? [] : [{ size, style: across }]
  })

  const price = useMemo(() => toPoints(asset?.price), [asset])
  const weights = useMemo(
    () =>
      (daily?.rows ?? []).map((row) => ({
        date: row.date,
        value: (numberIn(row, 'fund') ?? 0) * 100
      })),
    [daily]
  )
  const marks = useMemo(() => eventMarks(partOf(profile, 'events'), currency), [profile, currency])
  const against = profile?.against ?? undefined
  // Since and how often the fund has held it, among the key data (Karan, 2026-11-27).
  const since = daily?.rows.find((row) => (numberIn(row, 'fund') ?? 0) > 0)?.date
  const holding = [
    { label: 'Held since', value: since === undefined ? 'Not held' : dayOf(since) },
    ...(asset === undefined
      ? []
      : [{ label: 'Rebalances held', value: String(asset.rebalances_held) }])
  ]

  return (
    <div className="drilldown-head">
      <div className="summary-profile drilldown-profile">
        <Identity
          identifier={identifier}
          keyData={partOf(profile, 'key_data')}
          style={style}
          daily={daily}
          against={against}
          holding={holding}
          currency={currency}
        />
        <div className="drilldown-placing">
          <div className="drilldown-weights">
            <Section title="Weight">
              <WeightHistogram daily={daily} benchmarkIsIndex={benchmarkIsIndex} />
            </Section>
            <Section title="Active weight">
              <ActiveWeights daily={daily} against={against} />
            </Section>
          </div>
          <Section title="Style">
            <StyleBox
              frame={frameOf(answer, 'style_box')}
              positions={frameOf(answer, 'style_positions')}
              classification={frameOf(answer, 'style_classification')}
              spec={specOf('style_box')}
              benchmarkIsIndex={benchmarkIsIndex}
              name={place}
              trail={trail}
            />
          </Section>
        </div>
      </div>

      <div className="drilldown-chart">
        {price.length > 0 && (
          <LevelChart
            mode={mode}
            legend
            series={[{ label: `${identifier}${inCurrency(money.price)}`, points: price }]}
            // No bars without a profile: an engine before 0.11.0 sends no daily weights.
            {...(weights.length === 0
              ? {}
              : {
                  overlay: {
                    label: 'Weight in the fund',
                    points: weights,
                    kind: 'bars' as const,
                    format: (value: number) => `${value.toFixed(2)}%`
                  }
                })}
            events={marks}
            height={300}
          />
        )}
        <RebalanceWeights
          daily={daily}
          rebalances={(partOf(profile, 'rebalance_weights')?.rows ?? []).map((row) => row.date)}
          benchmarkIsIndex={benchmarkIsIndex}
        />
      </div>
    </div>
  )
}

/**
 * The name, large, with its box in words at the line's right end (the style
 * box alone says too little for words beside it, Karan, 2026-11-27) and its
 * identifier and the date of its key data under it, then every key field
 * the run kept, in the engine's order, small labels over their values as
 * the Overview's titles are.
 */
function Identity({
  identifier,
  keyData,
  style,
  daily,
  against,
  holding,
  currency
}: {
  identifier: string
  keyData: Part | undefined
  style: Part | undefined
  daily: Part | undefined
  /** The comparator the fund's active weight is against. */
  against: string | undefined
  /** How the fund has held it, after the key data in the same form. */
  holding: readonly { label: string; value: string }[]
  currency: string
}): ReactElement {
  const latest = keyData?.rows.at(-1)
  const name = latest?.values.name
  const fields = (keyData?.columns ?? []).filter((column) => column.name !== 'name')
  return (
    <div className="drilldown-identity">
      <div className="drilldown-name">
        <span className="drilldown-name-value">{typeof name === 'string' ? name : identifier}</span>
        <div className="drilldown-name-style">
          {boxOf(style)}
          <ActiveToken daily={daily} against={against} />
        </div>
        <span className="drilldown-name-meta type-11">
          {latest === undefined ? identifier : `${identifier} · key data at ${dayOf(latest.date)}`}
        </span>
      </div>
      {latest !== undefined && fields.length > 0 && (
        <dl className="drilldown-key-data">
          {fields.map((column) => (
            <div key={column.name} className="summary-title">
              <dt className="summary-title-label">{column.label}</dt>
              <dd className="drilldown-key-value">
                {cellText(column, latest.values[column.name] ?? null, currency)}
              </dd>
            </div>
          ))}
          {holding.map((field) => (
            <div key={field.label} className="summary-title">
              <dt className="summary-title-label">{field.label}</dt>
              <dd className="drilldown-key-value">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/**
 * Over- or underweight against the comparator now, from the engine's active
 * weight, as a token (Karan, 2026-11-27): overweight in green, underweight
 * in red. Nothing for a name the fund holds at the comparator's weight, or
 * for a run with no comparator's weights.
 */
function ActiveToken({
  daily,
  against
}: {
  daily: Part | undefined
  against: string | undefined
}): ReactElement | null {
  const active = numberIn(daily?.rows.at(-1), 'active')
  if (active === undefined || Math.abs(active) < 0.00005) return null
  const over = active > 0
  const label = (
    (against === undefined ? undefined : columnOf(daily, against)?.label) ?? 'comparator'
  ).toLowerCase()
  return (
    <HoverTip
      className={over ? 'active-token is-over' : 'active-token is-under'}
      tip={
        <div className="header-tip-title">
          {`${over ? 'Overweight' : 'Underweight'} by ${(Math.abs(active) * 100).toFixed(2)}% against the ${label}`}
        </div>
      }
    >
      {over ? 'OW' : 'UW'}
    </HoverTip>
  )
}

/** The name's latest box in words, as "Large growth"; nothing for a name never classified. */
function boxOf(style: Part | undefined): string {
  const latest = latestWith(style, 'size')
  if (latest === undefined) return ''
  const size = cellText(columnOf(style, 'size'), latest.values.size ?? null, '')
  const kind = cellText(columnOf(style, 'style'), latest.values.style ?? null, '')
  return `${size} ${kind.toLowerCase()}`
}

/**
 * The events as marks under the price, bare so a busy name stays readable;
 * the hover popup names each on its day.
 */
function eventMarks(part: Part | undefined, currency: string): ChartEvent[] {
  if (part === undefined) return []
  const event = columnOf(part, 'event')
  return part.rows.map((row) => {
    const code = String(row.values.event ?? '')
    const detail = row.values.detail
    const amount = row.values.amount
    const said = [
      cellText(event, code, currency),
      typeof detail === 'string' ? detail : undefined,
      typeof amount === 'number' ? eventAmount(code, amount) : undefined
    ].filter((each) => each !== undefined)
    return { date: row.date, text: '', shape: SHAPES[code] ?? 'circle', detail: said.join(' · ') }
  })
}
