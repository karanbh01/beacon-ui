import { useMemo, type ReactElement } from 'react'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { Table } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'
import { columnOf, missingOf, numberIn, partOf, type Part } from './profile'

/** A beta whose t-statistic is under this is noise more than signal, and is greyed. */
const SIGNIFICANT = 2

interface FactorRow {
  factor: string
  label: string
  exposure: number | undefined
  beta: number | undefined
  t: number | undefined
}

/**
 * Drilldown → Risk: what the name is and what it adds to the fund's risk.
 * Its share of the fund's volatility and tracking error at each rebalance;
 * what the risk model says it is beside how it has behaved (BN-471), with
 * a beta the data cannot tell from nothing greyed; and its style box over
 * time.
 */
export function DrilldownRisk({
  profile,
  comparator
}: {
  profile: InstrumentProfile | undefined
  comparator: string
}): ReactElement {
  const mode = useThemeMode()
  const risk = partOf(profile, 'risk')
  const series = useMemo((): Series[] => {
    const line = (name: string): { date: string; value: number }[] =>
      (risk?.rows ?? []).flatMap((row) => {
        const value = numberIn(row, name)
        return value === undefined ? [] : [{ date: row.date, value: value * 100 }]
      })
    const tracking = line('tracking_error_share')
    return [
      { label: 'Share of volatility', points: line('volatility_share') },
      ...(tracking.length === 0
        ? []
        : [
            {
              label: `Share of tracking error against the ${comparator}`,
              points: tracking,
              tone: 'second' as const
            }
          ])
    ]
  }, [risk, comparator])

  return (
    <div className="drilldown-face">
      <div className="drilldown-pair">
        <Section title="Its share of the fund's risk">
          {risk === undefined ? (
            <p className="drilldown-none type-11">{missingOf(profile, 'risk')}</p>
          ) : (
            <LevelChart
              mode={mode}
              legend
              series={series}
              height={300}
              note="at each rebalance, from the run's risk model"
            />
          )}
        </Section>
        <Section title="Factors at the latest rebalance">
          <Factors
            exposures={partOf(profile, 'factor_exposures')}
            betas={partOf(profile, 'factor_betas')}
            why={missingOf(profile, 'factor_exposures')}
          />
        </Section>
      </div>
      <div className="drilldown-pair">
        <Section title="Risk at each rebalance">
          <ProfileTable
            profile={profile}
            part="risk"
            dateHeader="Rebalance"
            shown={[
              { name: 'volatility_contribution', width: 96 },
              { name: 'volatility_share', width: 86 },
              { name: 'tracking_error_contribution', width: 106 },
              { name: 'tracking_error_share', width: 96 }
            ]}
          />
        </Section>
        <Section title="Style box over time">
          <ProfileTable
            profile={profile}
            part="style"
            dateHeader="Rebalance"
            shown={[
              { name: 'size', width: 70 },
              { name: 'style', width: 70 },
              { name: 'moved', width: 86 }
            ]}
          />
        </Section>
      </div>
    </div>
  )
}

/**
 * A row a factor, the model's exposure beside the returns' beta and its
 * t-statistic, at the latest rebalance each has. The factors are the run's,
 * read from the columns, since they differ from model to model.
 */
function Factors({
  exposures,
  betas,
  why
}: {
  exposures: Part | undefined
  betas: Part | undefined
  why: string
}): ReactElement {
  const exposed = exposures?.rows.at(-1)
  const measured = betas?.rows.at(-1)
  const factors = [
    ...new Set(
      [...(exposures?.columns ?? []), ...(betas?.columns ?? [])]
        .map((column) => column.name)
        .filter((name) => name.startsWith('exposure/') || name.startsWith('beta/'))
        .map((name) => name.slice(name.indexOf('/') + 1))
    )
  ]
  if (factors.length === 0) return <p className="drilldown-none type-11">{why}</p>
  const rows = factors.map((factor): FactorRow => ({
    factor,
    label:
      columnOf(exposures, `exposure/${factor}`)?.label ??
      factor.charAt(0).toUpperCase() + factor.slice(1),
    exposure: numberIn(exposed, `exposure/${factor}`),
    beta: numberIn(measured, `beta/${factor}`),
    t: numberIn(measured, `t_stat/${factor}`)
  }))
  const fixed = (value: number | undefined): string =>
    value === undefined ? '—' : value.toFixed(2)
  const faint = (row: FactorRow): string | undefined =>
    row.t !== undefined && Math.abs(row.t) < SIGNIFICANT ? 'drilldown-faint' : undefined
  const squared = numberIn(measured, 'r_squared')
  const observations = numberIn(measured, 'observations')

  return (
    <>
      <Table
        columns={[
          { key: 'label', header: 'Factor', width: 110, rowName: true, render: (row) => row.label },
          {
            key: 'exposure',
            header: 'Exposure',
            width: 80,
            align: 'right',
            render: (row) => fixed(row.exposure)
          },
          {
            key: 'beta',
            header: 'Beta',
            width: 70,
            align: 'right',
            render: (row) => <span className={faint(row)}>{fixed(row.beta)}</span>
          },
          {
            key: 't',
            header: 't-statistic',
            width: 80,
            align: 'right',
            render: (row) => <span className={faint(row)}>{fixed(row.t)}</span>
          }
        ]}
        rows={rows}
        getRowId={(row) => row.factor}
      />
      <p className="drilldown-note type-11">
        Exposures are the risk model&apos;s; betas are fitted to the name&apos;s own returns
        {observations === undefined ? '' : ` over ${String(observations)} days`}
        {squared === undefined ? '' : `, R² ${(squared * 100).toFixed(0)}%`}. A beta with a
        t-statistic under 2 is greyed.
        {betas === undefined && ' Betas need the data store loaded.'}
      </p>
    </>
  )
}
