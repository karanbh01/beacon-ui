import { useMemo, type ReactElement } from 'react'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { useThemeMode } from '../../state/theme'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'
import { missingOf, numberIn, partOf, type Period } from './profile'

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' }
]

const asPercent = (value: number): string => `${value.toFixed(2)}%`

/**
 * Drilldown → Contribution: what the name added to the fund's return. Its
 * contribution to date as a line, and against the comparator, with each
 * period's own under it as bars; the periods are the engine's (BN-469).
 * When the run links each period on its own the bars do not add up to the
 * line, and the note says so.
 */
export function DrilldownContribution({
  profile,
  by,
  onBy,
  comparator
}: {
  profile: InstrumentProfile | undefined
  by: Period
  onBy: (next: Period) => void
  comparator: string
}): ReactElement {
  const mode = useThemeMode()
  const part = partOf(profile, 'attribution')
  const series = useMemo((): Series[] => {
    const line = (name: string): { date: string; value: number }[] =>
      (part?.rows ?? []).flatMap((row) => {
        const value = numberIn(row, name)
        return value === undefined ? [] : [{ date: row.date, value: value * 100 }]
      })
    const active = line('active_contribution_to_date')
    return [
      { label: 'Contribution to date', points: line('contribution_to_date') },
      ...(active.length === 0
        ? []
        : [
            {
              label: `Active, against the ${comparator}`,
              points: active,
              tone: 'benchmark' as const
            }
          ])
    ]
  }, [part, comparator])
  const bars = useMemo(
    () =>
      (part?.rows ?? []).flatMap((row) => {
        const value = numberIn(row, 'contribution')
        return value === undefined ? [] : [{ date: row.date, value: value * 100 }]
      }),
    [part]
  )

  return (
    <div className="drilldown-face">
      <SegmentedControl
        segments={PERIODS}
        value={by}
        onChange={onBy}
        label="Periods"
        className="drilldown-periods"
      />
      {part === undefined ? (
        <p className="drilldown-none type-11">{missingOf(profile, 'attribution')}</p>
      ) : (
        <div className="drilldown-pair">
          <LevelChart
            mode={mode}
            legend
            series={series}
            panels={[
              {
                label: `Each ${by}`,
                series: [{ points: bars, kind: 'histogram' }],
                format: asPercent
              }
            ]}
            reference={0}
            height={380}
            note={
              profile?.linking === 'period'
                ? `each ${by} is linked on its own, so the bars do not add up to the line`
                : `each ${by} is its share of the whole run's, so the bars add up to the line`
            }
          />
          <Section title={`By ${by}`}>
            <ProfileTable
              profile={profile}
              part="attribution"
              dateHeader="Up to"
              maxBodyHeight={360}
              shown={[
                { name: 'contribution', width: 88, signed: true, header: 'Contribution' },
                { name: 'contribution_to_date', width: 88, signed: true, header: 'To date' },
                { name: 'active_contribution', width: 88, signed: true, header: 'Active' },
                {
                  name: 'active_contribution_to_date',
                  width: 88,
                  signed: true,
                  header: 'Active to date'
                }
              ]}
            />
          </Section>
        </div>
      )}
    </div>
  )
}
