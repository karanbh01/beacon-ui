import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { num, type FrameRow } from '../../api/frame'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useReference } from '../shared/queries'
import { RANGES, rangeStart, usePrices, type Range } from './usePrices'
import { compactVolume, price, signedPercent, summarise } from './summary'
import './PricesView.css'

/** Column widths from the Figma table-card (266:2880). */
function buildColumns(resolved: ReturnType<typeof summarise>['columns']): Column<FrameRow>[] {
  const columns: Column<FrameRow>[] = [
    {
      key: 'date',
      header: 'Date',
      width: 110,
      emphasis: true,
      render: (row) => formatDate(row.index)
    }
  ]

  const numeric = [
    { key: 'open', header: 'Open', width: 90, column: resolved.open },
    { key: 'high', header: 'High', width: 90, column: resolved.high },
    { key: 'low', header: 'Low', width: 90, column: resolved.low },
    { key: 'close', header: 'Close', width: 90, column: resolved.close },
    { key: 'adjClose', header: 'Adj Close', width: 100, column: resolved.adjClose }
  ]

  for (const spec of numeric) {
    if (spec.column === undefined) continue
    const source = spec.column
    columns.push({
      key: spec.key,
      header: spec.header,
      width: spec.width,
      align: 'right',
      render: (row) => price(num(row, source))
    })
  }

  if (resolved.volume !== undefined) {
    const source = resolved.volume
    columns.push({
      key: 'volume',
      header: 'Volume',
      width: 120,
      align: 'right',
      render: (row) => {
        const value = num(row, source)
        return value === undefined ? '—' : value.toLocaleString('en-US')
      }
    })
  }

  return columns
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Data Explorer → Prices. Figma frame 234:4402 / pane-content 266:2820.
 *
 * The first view served entirely by py-beacon: query header, summary strip
 * derived from the returned frame, range control and the OHLCV table.
 */
export function PricesView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const [range, setRange] = useState<Range>('1Y')
  const setSubject = useWorkspace((state) => state.setSubject)

  const start = useMemo(() => rangeStart(range), [range])
  const prices = usePrices(identifier, { start })
  const reference = useReference(identifier, { noRetry: true })

  const summary = useMemo(() => summarise(prices.data?.prices), [prices.data])
  const columns = useMemo(() => buildColumns(summary.columns), [summary.columns])

  const meta = reference.data === undefined ? undefined : describeInstrument(reference.data)

  return (
    <div className="prices-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(meta === undefined ? {} : { meta })}
        onQuery={(next) => {
          // The store owns the subject (BU-16); writing it here re-renders
          // this view with a new `subject` and keeps followers in step.
          setSubject(tab.id, next)
        }}
        controls={
          <>
            <Button chevron>Daily</Button>
            <Button chevron>Adjusted</Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      <StatStrip>
        <Stat label="LAST CLOSE" value={price(summary.lastClose)} />
        <Stat
          label="1D CHANGE"
          value={
            summary.changeAbs === undefined
              ? '—'
              : `${summary.changeAbs >= 0 ? '+' : '−'}${Math.abs(summary.changeAbs).toFixed(2)}  (${signedPercent(summary.changePct)})`
          }
          tone={
            summary.changeAbs === undefined
              ? 'default'
              : summary.changeAbs >= 0
                ? 'positive'
                : 'negative'
          }
        />
        <Stat
          label="52W RANGE"
          value={
            summary.low52 === undefined || summary.high52 === undefined
              ? '—'
              : `${price(summary.low52)} – ${price(summary.high52)}`
          }
        />
        <Stat label="AVG VOLUME · 3M" value={compactVolume(summary.avgVolume3M)} />
      </StatStrip>

      <SegmentedControl segments={RANGES} value={range} onChange={setRange} label="Range" />

      {identifier === '' && <ViewEmpty>Type an identifier to load its price history.</ViewEmpty>}

      {prices.isPending && identifier !== '' && <ViewLoading what={identifier} />}

      {prices.isError && <ViewError error={prices.error} />}

      {prices.isSuccess && summary.rows.length === 0 && (
        <ViewEmpty>No rows in this range.</ViewEmpty>
      )}

      {prices.isSuccess && summary.rows.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={summary.rows}
            getRowId={(row) => String(row.index)}
            maxBodyHeight={520}
          />
          <p className="prices-footnote type-11">
            {summary.rows.length.toLocaleString('en-US')} rows · {summary.firstDate} →{' '}
            {summary.lastDate} · interval: {prices.data.interval} · {tab.viewKind}
          </p>
        </>
      )}
    </div>
  )
}

/** "Apple Inc. · NASDAQ · USD · Common Stock", from whatever reference gives. */
function describeInstrument(reference: unknown): string | undefined {
  if (typeof reference !== 'object' || reference === null) return undefined
  const record = reference as Record<string, unknown>
  const parts = ['name', 'exchange', 'currency', 'instrument_type', 'type']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value !== '')
  return parts.length === 0 ? undefined : parts.join(' · ')
}
