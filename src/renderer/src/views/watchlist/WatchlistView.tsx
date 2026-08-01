import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { signedPercent } from '../prices/summary'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useSaveWatchlist, useWatchlists } from '../shared/queries'
import { Sparkline } from './Sparkline'
import { useWatchRows } from './useWatchRows'
import { compactCap, summariseRows, type WatchRow } from './watchlist'
import { AddSymbol } from './AddSymbol'
import './WatchlistView.css'

function toneOf(value: number | undefined): 'positive' | 'negative' | 'default' {
  if (value === undefined || value === 0) return 'default'
  return value > 0 ? 'positive' : 'negative'
}

function pct(value: number | undefined, dp = 2): ReactElement {
  return <span className={`tone-${toneOf(value)}`}>{signedPercent(value, dp)}</span>
}

const COLUMNS: readonly Column<WatchRow>[] = [
  { key: 'ticker', header: 'Ticker', width: 80, emphasis: true, render: (row) => row.ticker },
  { key: 'name', header: 'Name', width: 160, render: (row) => row.name ?? '—' },
  {
    key: 'last',
    header: 'Last',
    width: 90,
    align: 'right',
    render: (row) => (row.last === undefined ? '—' : row.last.toFixed(2))
  },
  { key: 'd1', header: '1D %', width: 80, align: 'right', render: (row) => pct(row.change1D) },
  { key: 'm1', header: '1M %', width: 80, align: 'right', render: (row) => pct(row.change1M, 1) },
  {
    key: 'ytd',
    header: 'YTD %',
    width: 80,
    align: 'right',
    render: (row) => pct(row.changeYTD, 1)
  },
  {
    key: 'volume',
    header: 'Volume',
    width: 100,
    align: 'right',
    render: (row) => (row.volume === undefined ? '—' : row.volume.toLocaleString('en-US'))
  },
  {
    key: 'cap',
    header: 'Mkt Cap',
    width: 100,
    align: 'right',
    render: (row) => compactCap(row.marketCap)
  },
  {
    key: 'spark',
    header: '3M',
    width: 90,
    render: (row) => <Sparkline values={row.spark} tone={toneOf(row.changeYTD)} />
  }
]

/**
 * Data Explorer → Watchlist. Figma 234:5236.
 *
 * The one pane in Data Explorer whose contents the user owns. Every number
 * beside a symbol is derived from the same prices and reference calls the
 * other views make, so the cache is shared and opening a row is instant.
 */
export function WatchlistView({ tab }: ViewProps): ReactElement {
  const lists = useWatchlists()
  const save = useSaveWatchlist()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const [selectedId, setSelectedId] = useState<string>('')

  const watchlists = lists.data?.watchlists ?? []
  const current = watchlists.find((list) => list.id === selectedId) ?? watchlists[0]
  const identifiers = useMemo(() => current?.identifiers ?? [], [current])

  const { rows, loading, error } = useWatchRows(identifiers)
  const summary = useMemo(() => summariseRows(rows), [rows])

  const addSymbol = (symbol: string): void => {
    if (current === undefined || identifiers.includes(symbol)) return
    save.mutate({ id: current.id, name: current.name, identifiers: [...identifiers, symbol] })
  }

  return (
    <div className="watchlist-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Select
          options={watchlists.map((list) => ({ value: list.id, label: list.name }))}
          value={current?.id ?? ''}
          onChange={setSelectedId}
          label="Watchlist"
          disabled={watchlists.length === 0}
        />
        <AddSymbol onAdd={addSymbol} disabled={current === undefined || save.isPending} />
      </PaneHeader>

      {lists.isPending && <ViewLoading what="watchlists" />}
      {lists.isError && <ViewError error={lists.error} />}

      {lists.isSuccess && current === undefined && (
        <ViewEmpty>
          This engine has no watchlists. py-beacon stores them in{' '}
          <code>~/.py-beacon/watchlists.json</code>.
        </ViewEmpty>
      )}

      {current !== undefined && (
        <>
          <SummaryLine
            items={[
              { label: `${String(summary.symbols)} symbols`, value: current.name },
              {
                label: 'today',
                value: `${String(summary.up)} up / ${String(summary.down)} down`
              },
              {
                label: 'average',
                value: signedPercent(summary.averageDay),
                tone: toneOf(summary.averageDay)
              },
              {
                label: 'best YTD',
                value:
                  summary.best === undefined
                    ? '—'
                    : `${summary.best.ticker} ${signedPercent(summary.best.changeYTD, 1)}`
              },
              {
                label: 'worst YTD',
                value:
                  summary.worst === undefined
                    ? '—'
                    : `${summary.worst.ticker} ${signedPercent(summary.worst.changeYTD, 1)}`
              }
            ]}
          />

          {error !== undefined && <ViewError error={error} />}

          {identifiers.length === 0 && <ViewEmpty>This watchlist is empty.</ViewEmpty>}

          {identifiers.length > 0 && (
            <Table
              columns={COLUMNS}
              rows={rows}
              getRowId={(row) => row.ticker}
              onSelectRow={(row) => {
                // Retargets the Prices tab already open on this page rather
                // than opening a second one, so anything linked to it — the
                // Charting tab — follows the click too.
                openOrRetarget({
                  page: tab.page,
                  viewKind: 'prices',
                  title: 'Prices',
                  subject: row.ticker
                })
              }}
              maxBodyHeight={520}
            />
          )}

          <p className="watchlist-footnote type-11">
            {String(identifiers.length)} symbols · {current.name} · watchlists are stored by the
            engine, not by beacon-ui · click a row to open Prices
            {loading && ' · loading quotes…'}
          </p>
        </>
      )}
    </div>
  )
}
