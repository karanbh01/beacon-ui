import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { StackedBarChart } from '../../charts/StackedBarChart'
import { seriesColor } from '../../charts/theme'
import { Section } from '../../components/Section/Section'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import { useComparators } from '../index-overview/comparators'
import { OpenChevron } from '../index-overview/Implementation'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { shortMonth } from '../shared/indexMetrics'
import {
  cellText,
  columnOf,
  dayOf,
  missingOf,
  numberIn,
  partOf,
  type Part,
  type ProfileRow
} from './profile'

/** A rebalance's row: the engine's weights that day, and the daily row of the same day. */
interface RebalanceRow extends ProfileRow {
  daily: ProfileRow | undefined
}

/** One rule the name was tested against, and its test at each rebalance it reached. */
interface Rule {
  id: string
  label: string
  /** What it measures, as a reader says it: "Market cap". */
  measure: string
  tests: Map<string, ProfileRow>
}

interface TestRow {
  id: string
  rule: string
  row: ProfileRow
}

/**
 * Drilldown → Selection (Karan, 2026-11-27): the weights each rebalance gave
 * the name against each portfolio's, a rebalance opening onto the rules it
 * was tested against that day, as the Overview's Implementation opens a
 * rebalance's names; beside it, one rule's value at each rebalance against
 * its threshold. Its events are marked on the chart above, and its
 * corporate actions have a face of their own.
 */
export function DrilldownSelection({
  strategyId,
  profile
}: {
  strategyId: string
  profile: InstrumentProfile | undefined
}): ReactElement {
  const { benchmarkIsIndex } = useComparators(strategyId)
  const [opened, setOpened] = useState<string | undefined>(undefined)
  const weights = partOf(profile, 'rebalance_weights')
  const selection = partOf(profile, 'selection')
  const rules = useMemo(() => rulesOf(selection, profile?.currency ?? ''), [selection, profile])
  // A margin under the run's near-miss share reads as a near miss (py-beacon BN-485).
  const near = profile?.near_miss ?? 0.1
  const toggle = (date: string): void => {
    setOpened((current) => (current === date ? undefined : date))
  }

  if (weights === undefined) {
    return (
      <div className="drilldown-face">
        <Section title="Weights at each rebalance">
          <p className="drilldown-none type-11">{missingOf(profile, 'rebalance_weights')}</p>
        </Section>
      </div>
    )
  }
  const days = new Map((partOf(profile, 'daily_weights')?.rows ?? []).map((row) => [row.date, row]))
  const rows: RebalanceRow[] = weights.rows
    .map((row) => ({ ...row, daily: days.get(row.date) }))
    .reverse()
  const tested = new Set(selection?.rows.map((row) => row.date))

  return (
    <div className="drilldown-face">
      <Section title="Weights at each rebalance">
        <div className="drilldown-selection">
          <Table
            columns={columnsOf(weights, benchmarkIsIndex, opened, tested, profile?.currency ?? '')}
            rows={rows}
            getRowId={(row) => row.date}
            className="drilldown-tokens"
            maxBodyHeight={520}
            onSelectRow={(row) => {
              if (tested.has(row.date)) toggle(row.date)
            }}
            {...(opened === undefined ? {} : { expandedId: opened })}
            renderExpanded={(row) =>
              selection === undefined ? undefined : (
                <RuleTests
                  part={selection}
                  rules={rules}
                  date={row.date}
                  currency={profile?.currency ?? ''}
                  near={near}
                />
              )
            }
          />
          {selection === undefined ? (
            <p className="drilldown-none type-11">{missingOf(profile, 'selection')}</p>
          ) : (
            <RuleChart
              part={selection}
              rules={rules}
              currency={profile?.currency ?? ''}
              near={near}
              opened={opened}
              onSelect={toggle}
            />
          )}
        </div>
      </Section>
    </div>
  )
}

/**
 * How the rules and caps moved the fund's weight, then the fund's beside
 * each portfolio's, a benchmark that is the index one column, and the
 * fund's active weight and whether that is over or under, from the
 * engine's daily weights that day. A rebalance the rules tested opens.
 */
function columnsOf(
  part: Part,
  benchmarkIsIndex: boolean,
  opened: string | undefined,
  tested: ReadonlySet<string>,
  currency: string
): Column<RebalanceRow>[] {
  const weight = (
    name: string,
    header: string | undefined,
    width: number
  ): Column<RebalanceRow>[] => {
    const column = columnOf(part, name)
    if (column === undefined) return []
    return [
      {
        key: name,
        header: header ?? column.label,
        width,
        align: column.unit == null ? 'left' : 'right',
        wrapHeader: true,
        render: (row) => cellText(column, row.values[name] ?? null, currency)
      }
    ]
  }
  return [
    { key: 'date', header: 'Rebalance', width: 86, render: (row) => dayOf(row.date) },
    ...weight('target', undefined, 64),
    ...weight('screened', undefined, 72),
    ...weight('capped', undefined, 64),
    ...weight('removed', undefined, 84),
    // The weight the fund traded to at the rebalance.
    ...weight('weight', 'Fund weight', 64),
    ...weight('index', benchmarkIsIndex ? 'Index/BM weight' : 'Index weight', 72),
    ...weight('optimised', 'Optimised weight', 72),
    ...(benchmarkIsIndex ? [] : weight('benchmark', 'Benchmark weight', 80)),
    {
      key: 'active',
      header: 'Active weight',
      width: 64,
      align: 'right',
      wrapHeader: true,
      render: (row) => <ActiveWeight active={numberIn(row.daily, 'active')} />
    },
    {
      key: 'token',
      header: 'OW/UW',
      width: 52,
      align: 'right',
      render: (row) => <ActiveToken active={numberIn(row.daily, 'active')} />
    },
    {
      key: 'open',
      header: '',
      width: 12,
      render: (row) => (tested.has(row.date) ? <OpenChevron open={row.date === opened} /> : null)
    }
  ]
}

function ActiveWeight({ active }: { active: number | undefined }): ReactElement {
  if (active === undefined) return <span className="drilldown-faint">—</span>
  const percent = `${(active * 100).toFixed(2)}%`
  if (active === 0) return <span className="report-figure">{percent}</span>
  return (
    <span className={active > 0 ? 'report-figure is-overweight' : 'report-figure is-underweight'}>
      {active > 0 ? `+${percent}` : percent}
    </span>
  )
}

function ActiveToken({ active }: { active: number | undefined }): ReactElement {
  if (active === undefined || active === 0) return <span className="drilldown-faint">—</span>
  return active > 0 ? (
    <span className="active-token is-over">OW</span>
  ) : (
    <span className="active-token is-under">UW</span>
  )
}

/**
 * Under an opened rebalance: each rule it was tested against that day, the
 * threshold, the name's own value and how far it cleared it as a share of
 * the threshold, a near miss and a failure marked. A rule it never reached,
 * an earlier one having removed it, has no row.
 */
function RuleTests({
  part,
  rules,
  date,
  currency,
  near
}: {
  part: Part
  rules: readonly Rule[]
  date: string
  currency: string
  near: number
}): ReactElement {
  const rows: TestRow[] = rules.flatMap((rule) => {
    const row = rule.tests.get(date)
    return row === undefined ? [] : [{ id: rule.id, rule: rule.label, row }]
  })
  const figure = (name: string): ((row: TestRow) => ReactNode) => {
    const column = columnOf(part, name)
    return (row) => cellText(column, row.row.values[name] ?? null, currency)
  }
  const columns: Column<TestRow>[] = [
    { key: 'rule', header: 'Rule', width: 200, render: (row) => row.rule },
    {
      key: 'threshold',
      header: 'Threshold',
      width: 84,
      align: 'right',
      render: figure('threshold')
    },
    { key: 'measured', header: 'Actual', width: 84, align: 'right', render: figure('measured') },
    {
      key: 'difference',
      header: 'Difference',
      width: 84,
      align: 'right',
      render: (row) => {
        const difference = numberIn(row.row, 'difference')
        const text = cellText(columnOf(part, 'difference'), difference ?? null, currency)
        return difference !== undefined && difference > 0 ? `+${text}` : text
      }
    },
    {
      key: 'margin',
      header: 'Relative',
      width: 72,
      align: 'right',
      render: (row) => <Relative row={row.row} near={near} />
    }
  ]
  return (
    <div className="drilldown-rule-tests">
      <Table columns={columns} rows={rows} getRowId={(row) => row.id} />
    </div>
  )
}

/** How far the name cleared the rule, as a share of the threshold. */
function Relative({ row, near }: { row: ProfileRow; near: number }): ReactElement {
  const margin = numberIn(row, 'margin')
  if (row.values.passed !== true) {
    return (
      <span className="drilldown-down">
        {margin === undefined ? 'Failed' : `${(margin * 100).toFixed(1)}%`}
      </span>
    )
  }
  if (margin === undefined) return <span>Passed</span>
  return (
    <span className={margin < near ? 'drilldown-near' : undefined}>
      {`${margin >= 0 ? '+' : ''}${(margin * 100).toFixed(1)}%`}
    </span>
  )
}

/**
 * One rule, chosen above the chart: the name's value at each rebalance it
 * was tested as a bar, the threshold as a dashed line (Karan, 2026-11-27).
 * A bar opens its rebalance in the table, and the one open there stands out.
 */
function RuleChart({
  part,
  rules,
  currency,
  near,
  opened,
  onSelect
}: {
  part: Part
  rules: readonly Rule[]
  currency: string
  /** The run's near-miss share of a threshold, as the engine gives it. */
  near: number
  opened: string | undefined
  onSelect: (date: string) => void
}): ReactElement {
  const mode = useThemeMode()
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const rule = rules.find((each) => each.id === picked) ?? rules[0]
  const measured = columnOf(part, 'measured')
  const reference = useMemo(
    () => ({
      label: 'Threshold',
      value: (date: string) => numberIn(rule?.tests.get(date), 'threshold'),
      // Within a near miss of it either side, as the Relative column marks one (Karan, 2026-11-27).
      band: { share: near, label: `Within ${String(Math.round(near * 100))}%` }
    }),
    [rule, near]
  )
  if (rule === undefined) return <p className="drilldown-none type-11">No rules tested it.</p>
  const dates = [...rule.tests.keys()]
  return (
    <div className="drilldown-rule-chart">
      <Select
        options={rules.map((each) => ({ value: each.id, label: each.label }))}
        value={rule.id}
        onChange={setPicked}
        label="Rule"
      />
      <StackedBarChart
        categories={dates}
        series={[{ key: 'measured', label: rule.measure, colour: seriesColor(mode, 1) }]}
        value={(date) => numberIn(rule.tests.get(date), 'measured') ?? 0}
        reference={reference}
        mode={mode}
        height={290}
        format={(value) => cellText(measured, value, currency)}
        tickLabel={shortMonth}
        focus={opened}
        onSelect={onSelect}
        label={`${rule.label} at each rebalance`}
      />
    </div>
  )
}

/**
 * The rules in the engine's order, each with its test at each rebalance,
 * oldest first, named by what they measure: "Market cap rule" (Karan,
 * 2026-11-27). Two rules on one measure, a floor and a ceiling, say which.
 */
function rulesOf(part: Part | undefined, currency: string): Rule[] {
  const rules = new Map<string, Rule>()
  const comparison = columnOf(part, 'comparison')
  const sides = new Map<string, string>()
  for (const row of part?.rows ?? []) {
    const id = `${String(row.values.rule)}/${String(row.values.measure)}/${String(row.values.comparison)}`
    const rule = rules.get(id) ?? {
      id,
      label: `${measureName(String(row.values.measure))} rule`,
      measure: measureName(String(row.values.measure)),
      tests: new Map<string, ProfileRow>()
    }
    rule.tests.set(row.date, row)
    rules.set(id, rule)
    sides.set(id, cellText(comparison, row.values.comparison ?? null, currency).toLowerCase())
  }
  const all = [...rules.values()]
  return all.map((rule) =>
    all.filter((each) => each.label === rule.label).length > 1
      ? { ...rule, label: `${rule.label} (${sides.get(rule.id) ?? ''})` }
      : rule
  )
}

/** A rule's measure as a reader says it: market_cap is "Market cap"; a field path stays as written. */
function measureName(measure: string): string {
  if (measure.includes('.')) return measure
  const words = measure.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
