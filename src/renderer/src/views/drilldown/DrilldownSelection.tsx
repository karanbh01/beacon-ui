import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import { Table, type Column } from '../../components/Table/Table'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'
import { cellText, columnOf, dayOf, eventAmount, missingOf, partOf, type Part } from './profile'

/** The rebalances the rules' table shows, newest first; the rest are a scroll away in the weights. */
const REBALANCES = 6
/** A margin under this reads as a near miss, as py-beacon's default `selection.near_miss`. */
const NEAR = 0.1

interface RuleRow {
  id: string
  label: string
  /** Margin by rebalance date; passed when the name cleared the rule. */
  margins: Record<string, { margin: number | null; passed: boolean }>
}

/**
 * Drilldown → Selection: why the name is held, and how close it came to
 * leaving. Each rule's margin at the latest rebalances, the weights each
 * rebalance gave it, and everything that happened to it, newest first.
 */
export function DrilldownSelection({
  profile
}: {
  profile: InstrumentProfile | undefined
}): ReactElement {
  const selection = partOf(profile, 'selection')
  return (
    <div className="drilldown-face">
      <Section title="How close it came to each rule">
        {selection === undefined ? (
          <p className="drilldown-none type-11">{missingOf(profile, 'selection')}</p>
        ) : (
          <RuleMargins part={selection} currency={profile?.currency ?? ''} />
        )}
      </Section>
      <div className="drilldown-pair">
        <Section title="Weights at each rebalance">
          <ProfileTable
            profile={profile}
            part="rebalance_weights"
            dateHeader="Rebalance"
            shown={[
              { name: 'target', width: 72 },
              { name: 'screened', width: 72 },
              { name: 'weight', width: 72 },
              { name: 'capped', width: 72 },
              { name: 'removed', width: 110 },
              { name: 'index', width: 72 },
              { name: 'optimised', width: 80 },
              { name: 'benchmark', width: 80 }
            ]}
          />
        </Section>
        <Section title="Events">
          <ProfileTable
            profile={profile}
            part="events"
            shown={[
              { name: 'event', width: 180 },
              { name: 'detail', width: 170 }
            ]}
            extra={{
              key: 'amount',
              header: 'Amount',
              width: 70,
              align: 'right',
              render: (row) => {
                const amount = row.values.amount
                return typeof amount === 'number'
                  ? eventAmount(String(row.values.event), amount)
                  : '—'
              }
            }}
          />
        </Section>
      </div>
    </div>
  )
}

/**
 * A row a rule, a column a rebalance: the margin the name cleared it by, as
 * a share of the threshold. Under a tenth is a near miss and a failure is
 * marked, so the eye goes straight to the rebalances that mattered.
 */
function RuleMargins({ part, currency }: { part: Part; currency: string }): ReactElement {
  const dates = [...new Set(part.rows.map((row) => row.date))].slice(-REBALANCES).reverse()
  const comparison = columnOf(part, 'comparison')
  const rules = new Map<string, RuleRow>()
  for (const row of part.rows) {
    const id = `${String(row.values.rule)}/${String(row.values.measure)}/${String(row.values.comparison)}`
    const rule = rules.get(id) ?? {
      id,
      label: `${measureName(String(row.values.measure))} ${cellText(comparison, row.values.comparison ?? null, currency).toLowerCase()} ${cellText(columnOf(part, 'threshold'), row.values.threshold ?? null, currency)}`,
      margins: {}
    }
    rule.margins[row.date] = {
      margin: typeof row.values.margin === 'number' ? row.values.margin : null,
      passed: row.values.passed === true
    }
    rules.set(id, rule)
  }
  const columns: Column<RuleRow>[] = [
    { key: 'rule', header: 'Rule', width: 240, rowName: true, render: (row) => row.label },
    ...dates.map((date): Column<RuleRow> => ({
      key: date,
      header: dayOf(date),
      width: 86,
      align: 'right',
      render: (row) => <Margin entry={row.margins[date]} />
    }))
  ]
  return <Table columns={columns} rows={[...rules.values()]} getRowId={(row) => row.id} />
}

function Margin({
  entry
}: {
  entry: { margin: number | null; passed: boolean } | undefined
}): ReactElement {
  // A rule the name never reached: an earlier one removed it.
  if (entry === undefined) return <span className="drilldown-faint">—</span>
  if (!entry.passed) return <span className="drilldown-down">Failed</span>
  if (entry.margin === null) return <span>Passed</span>
  const near = entry.margin < NEAR
  return (
    <span className={near ? 'drilldown-near' : undefined}>
      {`${(entry.margin * 100).toFixed(1)}%`}
    </span>
  )
}

/** A rule's measure as a reader says it: market_cap is "Market cap"; a field path stays as written. */
function measureName(measure: string): string {
  if (measure.includes('.')) return measure
  const words = measure.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
