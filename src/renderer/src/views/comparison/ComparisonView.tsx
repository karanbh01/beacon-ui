import { useMemo, useState, type ReactElement } from 'react'
import { LevelChart } from '../../charts/LevelChart'
import type { Point } from '../../charts/transform'
import { seriesColor } from '../../charts/theme'
import { AddValue } from '../../components/AddValue/AddValue'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Table, type Column } from '../../components/Table/Table'
import { useThemeMode } from '../../state/theme'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { useCompare } from '../shared/beaconQueries'
import { toPoints } from '../shared/indexMetrics'
import { bestOf, metricRows, type MetricRow } from './comparison'
import './ComparisonView.css'

/**
 * Beacon View → Comparison. Figma 234:9128.
 *
 * `/beacon/compare` rebases every entry to 100 on the first SHARED date, so
 * the chart is a comparison of shape rather than of level — which is the
 * point, and why the pane does not offer a "since base" toggle the endpoint
 * could not honour.
 */
export function ComparisonView({ tab, subject }: ViewProps): ReactElement {
  const anchor = subject ?? tab.pinnedDoc ?? ''
  const [added, setAdded] = useState<readonly string[]>([])
  const mode = useThemeMode()

  const ids = useMemo(() => [anchor, ...added].filter((id) => id !== ''), [anchor, added])
  const compare = useCompare(ids)

  const series = useMemo<Record<string, Point[]>>(() => {
    const entries = compare.data?.entries ?? []
    return Object.fromEntries(entries.map((entry) => [entry.index_id, toPoints(entry.level)]))
  }, [compare.data])

  const rows = useMemo(() => metricRows(series), [series])
  const drawn = Object.keys(series)

  const columns = useMemo<Column<MetricRow>[]>(
    () => [
      { key: 'metric', header: 'Metric', width: 190, emphasis: true, render: (row) => row.metric },
      ...drawn.map((id) => ({
        key: id,
        header: id,
        width: 110,
        align: 'right' as const,
        render: (row: MetricRow) => row.format(row.values[id])
      })),
      {
        key: 'best',
        header: 'Best',
        width: 110,
        render: (row) => bestOf(row) ?? '—'
      }
    ],
    [drawn]
  )

  return (
    <div className="comparison-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <div className="comparison-chips">
          {ids.map((id, index) => (
            <span key={id} className="comparison-chip type-11">
              <span
                className="comparison-dot"
                style={{ background: seriesColor(mode, index) }}
                aria-hidden="true"
              />
              {id}
              {id !== anchor && (
                <button
                  type="button"
                  className="comparison-remove"
                  aria-label={`Remove ${id}`}
                  onClick={() => {
                    setAdded((current) => current.filter((entry) => entry !== id))
                  }}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
          <AddValue
            label="Add index…"
            onAdd={(id) => {
              setAdded((current) => (ids.includes(id) ? current : [...current, id]))
            }}
          />
        </div>
      </PaneHeader>

      {anchor === '' && <ViewEmpty>Pin this pane to an index to compare from.</ViewEmpty>}
      {ids.length < 2 && anchor !== '' && (
        <ViewEmpty>Add a second index — a comparison needs two.</ViewEmpty>
      )}
      {compare.isError && <ViewError error={compare.error} />}

      {compare.isSuccess && drawn.length >= 2 && (
        <>
          <LevelChart
            mode={mode}
            series={drawn.map((id) => ({ label: id, points: series[id] ?? [] }))}
            note={`growth of 100 · ${String(compare.data.observations)} shared observations`}
            height={480}
          />

          <Table columns={columns} rows={rows} getRowId={(row) => row.metric} />

          <p className="comparison-footnote type-11">
            {compare.data.start.slice(0, 10)} → {compare.data.end.slice(0, 10)} · rebased to 100 on
            the first date every index covers · everything below total return is derived from those
            levels · Sharpe is omitted: it needs a risk-free rate neither the engine nor the design
            defines
          </p>
        </>
      )}
    </div>
  )
}
