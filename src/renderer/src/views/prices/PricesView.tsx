import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { ApiError, NetworkError } from '../../api/errors'
import { num, type FrameRow } from '../../api/frame'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import type { ViewProps } from '../../shell/viewRegistry'
import { RANGES, rangeStart, usePrices, useReference, type Range } from './usePrices'
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
 * The error a user can actually act on.
 *
 * py-beacon's envelope carries a stable `code`, so the one failure that is
 * certain to happen on a fresh install — a server started without a data
 * source — gets a specific explanation rather than a raw 500.
 */
function PricesError({ error }: { error: unknown }): ReactElement {
  if (error instanceof NetworkError) {
    return (
      <div className="prices-state">
        <p className="type-13">The Beacon engine is not reachable.</p>
        <p className="type-11">Check the footer — it reports what the python process is doing.</p>
      </div>
    )
  }

  if (error instanceof ApiError && error.code === 'CONFIGURATION_ERROR') {
    return (
      <div className="prices-state">
        <p className="type-13">This engine has no data source.</p>
        <p className="type-11">
          py-beacon is running, but <code>python -m beacon.server</code> was started without one, so
          no market data can be served. See beacon-ui issue #40.
        </p>
      </div>
    )
  }

  if (error instanceof ApiError && error.isNotFound) {
    return (
      <div className="prices-state">
        <p className="type-13">No prices for this identifier.</p>
        <p className="type-11">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="prices-state">
      <p className="type-13">Could not load prices.</p>
      <p className="type-11">{error instanceof Error ? error.message : 'Unknown error.'}</p>
    </div>
  )
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

  const start = useMemo(() => rangeStart(range), [range])
  const prices = usePrices(identifier, { start })
  const reference = useReference(identifier)

  const summary = useMemo(() => summarise(prices.data?.prices), [prices.data])
  const columns = useMemo(() => buildColumns(summary.columns), [summary.columns])

  const meta = reference.data === undefined ? undefined : describeInstrument(reference.data)

  return (
    <div className="prices-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(meta === undefined ? {} : { meta })}
        onQuery={() => {
          // Subject changes flow through the workspace store (BU-16), which
          // re-renders this view with a new `subject`. Wiring it here would
          // fork the source of truth.
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

      {prices.isPending && identifier !== '' && (
        <p className="prices-state type-11">Loading {identifier}…</p>
      )}

      {prices.isError && <PricesError error={prices.error} />}

      {prices.isSuccess && summary.rows.length === 0 && (
        <p className="prices-state type-11">No rows in this range.</p>
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
