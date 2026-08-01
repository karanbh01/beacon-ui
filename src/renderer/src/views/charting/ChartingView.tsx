import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { LevelChart } from '../../charts/LevelChart'
import { useThemeMode } from '../../state/theme'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { RANGES, rangeStart, type Range } from '../prices/usePrices'
import { useReference } from '../shared/queries'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { ChartToolbar } from './ChartToolbar'
import { useChartSeries, type Interval } from './useChartSeries'
import './ChartingView.css'

function describeInstrument(fields: Record<string, unknown> | undefined): string | undefined {
  if (fields === undefined) return undefined
  const index = new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]))
  const parts = ['name', 'exchange', 'currency']
    .map((key) => index.get(key))
    .filter((value): value is string => typeof value === 'string' && value !== '')
  return parts.length === 0 ? undefined : parts.join(' · ')
}

/**
 * Data Explorer → Charting. Figma 234:5514.
 *
 * The linked archetype's proving ground (taxonomy §1–2): the subject is not
 * this tab's, it is resolved live from the Prices tab, and typing here takes
 * ownership. Neither behaviour lives in this file — `resolveSubject` and
 * `severLink` own them, and the view only routes the gestures.
 */
export function ChartingView({ tab, subject }: ViewProps): ReactElement {
  const [range, setRange] = useState<Range>('1Y')
  const [interval, setInterval] = useState<Interval>('native')
  const [compare, setCompare] = useState<readonly string[]>([])

  const mode = useThemeMode()
  const setSubject = useWorkspace((state) => state.setSubject)
  const severLink = useWorkspace((state) => state.severLink)
  const sourceTitle = useWorkspace((state) =>
    tab.linkSourceId === undefined
      ? undefined
      : state.tabs.find((candidate) => candidate.id === tab.linkSourceId)?.title
  )

  const identifier = subject ?? ''
  const start = useMemo(() => rangeStart(range), [range])
  const data = useChartSeries({ subject: identifier, compare, start, interval })
  const reference = useReference(identifier, { noRetry: true })

  const meta = describeInstrument(reference.data?.fields)
  const rangeLabel = RANGES.find((option) => option.value === range)?.label ?? range

  return (
    <div className="charting-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(sourceTitle === undefined ? {} : { linkedTo: sourceTitle })}
        {...(meta === undefined ? {} : { meta })}
        onQuery={(next) => {
          // Enter on a linked field is also a claim of ownership: the tab
          // must stop following before it can hold a subject of its own.
          if (tab.archetype === 'linked') severLink(tab.id)
          setSubject(tab.id, next)
        }}
        onSever={() => {
          severLink(tab.id)
        }}
        controls={
          <>
            <Button chevron>Line</Button>
            <Button chevron>Indicators</Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      <ChartToolbar
        range={range}
        onRange={setRange}
        interval={interval}
        onInterval={setInterval}
        compare={compare}
        mode={mode}
        onAdd={(next) => {
          setCompare((current) =>
            next === identifier || current.includes(next) ? current : [...current, next]
          )
        }}
        onRemove={(next) => {
          setCompare((current) => current.filter((entry) => entry !== next))
        }}
      />

      {identifier === '' && (
        <ViewEmpty>
          {tab.archetype === 'linked'
            ? 'The tab this one follows has no subject yet.'
            : 'Type an identifier to chart it.'}
        </ViewEmpty>
      )}

      {identifier !== '' && data.loading && data.series.length === 0 && (
        <ViewLoading what={identifier} />
      )}

      {data.error !== undefined && <ViewError error={data.error} />}

      {data.series.length > 0 && (
        <LevelChart
          mode={mode}
          series={data.series}
          {...(data.volume.length === 0
            ? {}
            : {
                subPanel: {
                  label: `volume · ${identifier}`,
                  points: data.volume,
                  kind: 'histogram' as const
                }
              })}
          {...(data.rebased && data.baseDate !== undefined
            ? { note: `rebased · 100 = ${data.baseDate}` }
            : {})}
          height={520}
        />
      )}

      <p className="charting-footnote type-11">
        {tab.archetype === 'linked'
          ? `linked to ${sourceTitle ?? 'another tab'} · subject follows the source tab · a manual query breaks the link`
          : 'independent · this tab holds its own subject'}
        {' · '}
        {rangeLabel} {interval === 'native' ? 'daily' : interval}
        {compare.length > 0 && ` · compare: ${compare.join(', ')} (rebased)`}
      </p>
    </div>
  )
}
