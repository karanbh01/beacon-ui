import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { AnalysisOptions, Analytics, Level } from '../../../api/analytics'
import { Section } from '../../../components/Section/Section'
import { SegmentedControl } from '../../../components/SegmentedControl/SegmentedControl'
import { useAnalysisOptions, useAnalytics } from '../analyticsQueries'
import { ViewEmpty, ViewError, ViewLoading } from '../ViewState'
import { layOut, type LaidOutSection } from './reportLayout'
import { CompoundFigures, FiguresTable, RollingChart, StatisticTable } from './StatisticBlocks'
import './ReportFace.css'

const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'core', label: 'Core' },
  { value: 'extended', label: 'Extended' }
]

export interface ReportFaceProps {
  strategyId: string
  /** The reports the face is built from, in the order their sections read. */
  reports: readonly string[]
  /** Above the sections, such as the Summary's chart. */
  lead?: ReactNode
}

/**
 * A face drawn from py-beacon's report catalogue (BN-398, BN-400).
 *
 * Which statistics show, in which sections and order, and how each is
 * labelled and formatted are the catalogue's; the face only chooses the
 * reports and the level. Core or Extended is the face's own switch, so
 * Summary can stay short while Performance is read in full.
 */
export function ReportFace({ strategyId, reports, lead }: ReportFaceProps): ReactElement {
  const [level, setLevel] = useState<Level>('core')
  const options = useAnalysisOptions()
  const answer = useAnalytics(strategyId)

  if (options.isError) return <ViewError error={options.error} />
  if (answer.isError) return <ViewError error={answer.error} />
  if (options.data === undefined || answer.data === undefined) {
    return <ViewLoading what="the analytics" />
  }
  if (answer.data.status === 'not_computed') {
    return (
      <ViewEmpty figure="plot">
        {answer.data.reason} Compute the analytics to see them here.
      </ViewEmpty>
    )
  }
  return (
    <div className="report-face">
      <div className="report-face-head">
        <SegmentedControl segments={LEVELS} value={level} onChange={setLevel} label="Detail" />
      </div>
      {lead}
      <Sections
        options={options.data}
        analytics={answer.data.analytics}
        reports={reports}
        level={level}
      />
    </div>
  )
}

function Sections({
  options,
  analytics,
  reports,
  level
}: {
  options: AnalysisOptions
  analytics: Analytics
  reports: readonly string[]
  level: Level
}): ReactElement {
  const sections = useMemo(() => layOut(options, reports, level), [options, reports, level])
  return (
    <>
      {sections.map((section) => (
        <Section key={section.label} title={section.label}>
          <SectionBody section={section} options={options} analytics={analytics} />
        </Section>
      ))}
    </>
  )
}

/**
 * A section's statistics by kind: its plain figures as one table, then any
 * compound figures and tables each under their own name, and the rolling
 * chart last, for the figures set to show over time.
 */
function SectionBody({
  section,
  options,
  analytics
}: {
  section: LaidOutSection
  options: AnalysisOptions
  analytics: Analytics
}): ReactElement {
  const plain = section.statistics.filter(
    ({ spec }) => spec.kind === 'figures' && spec.figure_names === undefined
  )
  const compound = section.statistics.filter(
    ({ spec }) => spec.kind === 'figures' && spec.figure_names !== undefined
  )
  const tables = section.statistics.filter(({ spec }) => spec.kind === 'table')
  return (
    <div className="report-section">
      {plain.length > 0 && (
        <FiguresTable statistics={plain} analytics={analytics} options={options} />
      )}
      {compound.map((item) => (
        <CompoundFigures key={item.spec.id} item={item} analytics={analytics} options={options} />
      ))}
      {tables.map((item) => {
        const missing = analytics.unavailable[item.spec.id]
        return (
          <div key={item.spec.id} className="report-table">
            <p className="report-table-name type-11">{item.spec.label}</p>
            {missing === undefined ? (
              <StatisticTable item={item} analytics={analytics} />
            ) : (
              <p className="report-missing type-11">{missing.reason}</p>
            )}
          </div>
        )
      })}
      <RollingChart statistics={plain} analytics={analytics} options={options} />
    </div>
  )
}
