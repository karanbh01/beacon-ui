import { useMemo, useState, type ReactElement } from 'react'
import { StatusPill } from '../../components/Badge/Badge'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useCoverage, useSyncDataset } from '../shared/queries'
import {
  datasetLabel,
  datasetOptions,
  describeAge,
  describeSpan,
  filterByDataset,
  statusLabel,
  statusOf,
  summarise,
  describeBytes,
  frequencyLabel,
  sourceLabel,
  type CoverageStatus,
  type DatasetCoverage
} from './coverage'
import { useRegenerate } from './useRegenerate'
import './CoverageView.css'

const PILL: Record<CoverageStatus, 'done' | 'running' | 'failed' | 'info'> = {
  ok: 'done',
  stale: 'running',
  never: 'info',
  absent: 'failed'
}

/**
 * Data Explorer → Data Coverage. Figma 234:5792.
 *
 * Every element of the frame is live since BN-119: Source and Frequency as
 * columns, FIELDS, SOURCES and CACHE SIZE in the strip, and ASSETS COVERED
 * from `identifiers_union` — the distinct count across datasets, rather than
 * a sum that double-counts every instrument holding both prices and
 * reference data.
 *
 * Staleness is the engine's call now too. This file used to hold a threshold
 * per dataset because the response carried no frequency; `stale_after_seconds`
 * replaced that guess.
 */
export function CoverageView(): ReactElement {
  const [dataset, setDataset] = useState('')
  const query = useCoverage()
  const sync = useSyncDataset()
  const regenerate = useRegenerate()

  // Memoised because `?? []` is a fresh array on every render, which would
  // make every downstream useMemo recompute for nothing.
  const datasets = query.data?.datasets
  const rows = useMemo(() => datasets ?? [], [datasets])
  const summary = useMemo(() => summarise(rows, query.data), [rows, query.data])
  const shown = useMemo(() => filterByDataset(rows, dataset), [rows, dataset])

  const columns = useMemo(() => buildColumns(sync.mutate, sync.isPending), [sync])

  return (
    <div className="coverage-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button
              onClick={() => {
                // Every configured dataset, one job each. py-beacon has no
                // "sync everything" endpoint, and firing them together is
                // what the button claims to do.
                for (const row of rows.filter((candidate) => candidate.configured)) {
                  sync.mutate(row.dataset)
                }
              }}
              disabled={rows.length === 0 || sync.isPending}
            >
              Force sync
            </Button>
            {/*
              Replacing the demo store, rather than finding it on disk and
              deleting it by hand (BU-107) — which on Windows does not even
              work from Explorer, because the Store build of python redirects
              the path py-beacon reports.
            */}
            <Button onClick={() => void regenerate.run()} disabled={regenerate.busy}>
              {regenerate.busy ? 'Replacing…' : 'Replace data…'}
            </Button>
          </>
        }
      >
        <Select
          options={datasetOptions(rows)}
          value={dataset}
          onChange={setDataset}
          label="Dataset"
        />
      </PaneHeader>

      {query.isPending && <ViewLoading what="coverage" />}
      {query.isError && <ViewError error={query.error} />}

      {query.isSuccess && (
        <>
          {regenerate.problem !== undefined && (
        <p className="coverage-problem type-11">{regenerate.problem}</p>
      )}

      <StatStrip>
            <Stat label="DATASETS" value={String(summary.datasets)} />
            <Stat
              label="CONFIGURED"
              value={`${String(summary.configured)} / ${String(summary.datasets)}`}
            />
            <Stat label="ASSETS COVERED" value={summary.assets.toLocaleString('en-US')} />
            <Stat label="SOURCES" value={String(summary.sources)} />
            <Stat label="FIELDS" value={String(summary.fields)} />
            <Stat label="CACHE SIZE" value={describeBytes(summary.cacheBytes)} />
            <Stat label="FRESHEST" value={describeAge(summary.newestAge)} />
            <Stat
              label="STALE DATASETS"
              value={String(summary.stale)}
              tone={summary.stale > 0 ? 'negative' : 'default'}
            />
          </StatStrip>

          {shown.length === 0 && <ViewEmpty>This engine reports no datasets.</ViewEmpty>}

          {shown.length > 0 && (
            <Table columns={columns} rows={shown} getRowId={(row) => row.dataset} />
          )}

          <p className="coverage-footnote type-11">
            Coverage refreshes on sync · stale = older than this dataset&rsquo;s own refresh
            interval, which the engine publishes · assets covered counts each identifier once
            across datasets · sync runs as a job; watch the tray
          </p>
        </>
      )}
    </div>
  )
}

function buildColumns(
  onSync: (dataset: string) => void,
  syncing: boolean
): Column<DatasetCoverage>[] {
  return [
    {
      key: 'dataset',
      header: 'Dataset',
      width: 190,
      emphasis: true,
      render: (row) => datasetLabel(row.dataset)
    },
    { key: 'source', header: 'Source', width: 130, render: (row) => sourceLabel(row.source) },
    {
      key: 'frequency',
      header: 'Frequency',
      width: 100,
      render: (row) => frequencyLabel(row.frequency)
    },
    {
      key: 'identifiers',
      header: 'Identifiers',
      width: 110,
      align: 'right',
      render: (row) => row.identifiers.toLocaleString('en-US')
    },
    { key: 'span', header: 'History', width: 140, render: describeSpan },
    {
      key: 'age',
      header: 'Last Updated',
      width: 120,
      render: (row) => describeAge(row.cache_age)
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: (row) => {
        const status = statusOf(row)
        return <StatusPill status={PILL[status]}>{statusLabel(status)}</StatusPill>
      }
    },
    {
      key: 'sync',
      header: '',
      width: 90,
      render: (row) => (
        <Button
          onClick={() => {
            onSync(row.dataset)
          }}
          disabled={syncing || !row.configured}
        >
          Sync
        </Button>
      )
    }
  ]
}
