import type { AnalysisOptions, Level, ReportEntry, StatisticSpec } from '../../../api/analytics'

export interface LaidOutStatistic {
  spec: StatisticSpec
  entry: ReportEntry
}

export interface LaidOutSection {
  label: string
  statistics: LaidOutStatistic[]
}

/**
 * One face's sections from several reports (Karan: a view is built from
 * whichever reports it needs, not one each).
 *
 * The reports are read in the order given, each at the level asked. A
 * section heading met again joins the first of that name, and a statistic
 * two reports both list shows once, where it first appears: the payload
 * carries it once, so the face does too. Optional statistics are left out
 * unless switched on.
 */
export function layOut(
  options: AnalysisOptions,
  reports: readonly string[],
  level: Level,
  switchedOn: ReadonlySet<string> = new Set()
): LaidOutSection[] {
  const specs = new Map(options.statistics.map((spec) => [spec.id, spec]))
  const sections: LaidOutSection[] = []
  const seen = new Set<string>()
  for (const id of reports) {
    const report = options.reports.find((candidate) => candidate.id === id)
    if (report === undefined) continue
    const ordered = [...report.levels[level].sections].sort((a, b) => a.order - b.order)
    for (const section of ordered) {
      const shown = section.statistics.filter(
        (entry) => !seen.has(entry.id) && (entry.state === 'included' || switchedOn.has(entry.id))
      )
      const laid = shown.flatMap((entry) => {
        const spec = specs.get(entry.id)
        if (spec === undefined) return []
        seen.add(entry.id)
        return [{ spec, entry }]
      })
      if (laid.length === 0) continue
      const existing = sections.find((candidate) => candidate.label === section.label)
      if (existing === undefined) sections.push({ label: section.label, statistics: laid })
      else existing.statistics.push(...laid)
    }
  }
  return sections
}
