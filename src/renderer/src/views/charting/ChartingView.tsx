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
import { useChartOverlays } from './useChartOverlays'
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
  const [adjusted, setAdjusted] = useState(false)
  const [events, setEvents] = useState(false)
  const [field, setField] = useState('')

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
  const data = useChartSeries({ subject: identifier, compare, start, interval, adjusted })
  const overlays = useChartOverlays({ subject: identifier, start, events, field })
  const reference = useReference(identifier, { noRetry: true })

  /*
   * Memoised because the chart rebuilds its series when these change
   * identity. An object literal in the JSX is a new one every render, which
   * meant every keystroke elsewhere in the view redrew the chart and reset
   * whatever the reader had panned to.
   */
  const subPanel = useMemo(
    () =>
      data.volume.length === 0
        ? undefined
        : { label: `volume · ${identifier}`, points: data.volume, kind: 'histogram' as const },
    [data.volume, identifier]
  )

  const meta = describeInstrument(reference.data?.fields)
  const rangeLabel = RANGES.find((option) => option.value === range)?.label ?? range

  return (
    <div className="charting-view">
      <PaneHeader
        kind="query"
        requires="market"
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
        adjusted={adjusted}
        onAdjusted={setAdjusted}
        events={events}
        onEvents={setEvents}
        hasEvents={overlays.hasEvents}
        // A field the last instrument had and this one does not is not a
        // choice this instrument can show.
        field={overlays.fields.includes(field) ? field : ''}
        onField={setField}
        fields={overlays.fields}
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
          {...(subPanel === undefined ? {} : { subPanel })}
          events={overlays.events}
          {...(overlays.overlay === undefined ? {} : { overlay: overlays.overlay })}
          {...(data.rebased && data.baseDate !== undefined
            ? { note: `rebased · 100 = ${data.baseDate}` }
            : {})}
          height="fill"
        />
      )}

      <p className="charting-footnote type-11">
        {tab.archetype === 'linked'
          ? `linked to ${sourceTitle ?? 'another tab'} · subject follows the source tab · a manual query breaks the link`
          : 'independent · this tab holds its own subject'}
        {' · '}
        {rangeLabel} {interval === 'native' ? 'daily' : interval}
        {' · '}
        {adjusted ? 'adjusted' : 'unadjusted'}
        {overlays.events.length > 0 &&
          ` · ${String(overlays.events.length)} corporate action${overlays.events.length === 1 ? '' : 's'}`}
        {overlays.overlay !== undefined && ` · ${overlays.overlay.label} on the right axis`}
        {compare.length > 0 && ` · compare: ${compare.join(', ')} (rebased)`}
      </p>
    </div>
  )
}
