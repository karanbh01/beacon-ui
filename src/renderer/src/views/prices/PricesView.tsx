import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { num, type FrameRow } from '../../api/frame'
import { MenuButton } from '../../components/MenuButton/MenuButton'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useReference } from '../shared/queries'
import { useExport } from '../../export/useExport'
import { sheetFromFrame } from '../../export/sheet'
import { INTERVALS, RANGES, rangeStart, usePrices, type Interval, type Range } from './usePrices'
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
  const [interval, setInterval] = useState<Interval>('native')
  const setSubject = useWorkspace((state) => state.setSubject)
  const exporter = useExport()

  const start = useMemo(() => rangeStart(range), [range])
  const prices = usePrices(identifier, { start, interval })
  const reference = useReference(identifier, { noRetry: true })

  const summary = useMemo(() => summarise(prices.data?.prices), [prices.data])
  const columns = useMemo(() => buildColumns(summary.columns), [summary.columns])

  const meta = reference.data === undefined ? undefined : describeInstrument(reference.data)

  // Built on demand: serialising a 5,000-row frame on every render to serve a
  // button most sessions never press is work for nothing.
  const sheet = (): ReturnType<typeof sheetFromFrame> =>
    sheetFromFrame(prices.data?.prices, `Prices ${identifier}`)

  return (
    <div className="prices-view">
      <PaneHeader
        kind="query"
        requires="market"
        subject={identifier}
        {...(meta === undefined ? {} : { meta })}
        onQuery={(next) => {
          // The store owns the subject (BU-16); writing it here re-renders
          // this view with a new `subject` and keeps followers in step.
          setSubject(tab.id, next)
        }}
        controls={
          <>
            <MenuButton
              label={INTERVALS.find((entry) => entry.value === interval)?.label ?? 'Native'}
              value={interval}
              choices={INTERVALS.map((entry) => ({ value: entry.value, label: entry.label }))}
              onChoose={(value) => {
                setInterval(value as Interval)
              }}
            />
            {/*
              "Adjusted" is gone rather than inert (BU-106). The market data
              is OPEN/HIGH/LOW/CLOSE/VOLUME/SHARES_OUTSTANDING/FREE_FLOAT/RATE
              and `/data/prices` takes no `adjusted` parameter, so there is no
              adjusted series to switch to. Deriving one here from corporate
              actions would be a second implementation of adjustment logic
              beside the engine's — see docs/engine-requests.
            */}
            <MenuButton
              label="Export"
              disabled={summary.rows.length === 0 || exporter.busy}
              choices={[
                { value: 'csv', label: 'CSV' },
                { value: 'xlsx', label: 'Excel' }
              ]}
              onChoose={(format) => {
                void exporter.save(sheet(), format === 'xlsx' ? 'xlsx' : 'csv')
              }}
            />
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
