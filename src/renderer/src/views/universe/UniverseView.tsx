import { useMemo, type ReactElement } from 'react'
import { useQueries } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useUniverseMembers, useUniverses } from '../shared/strategyQueries'
import { DETAIL_LIMIT, billions, buildRow, type UniverseRow } from './universe'
import './UniverseView.css'

const COLUMNS: readonly Column<UniverseRow>[] = [
  {
    key: 'position',
    header: '#',
    width: 40,
    align: 'right',
    render: (row) => String(row.position)
  },
  { key: 'ticker', header: 'Ticker', width: 80, emphasis: true, render: (row) => row.ticker },
  { key: 'name', header: 'Name', width: 200, render: (row) => row.name ?? '—' },
  { key: 'sector', header: 'GICS Sector', width: 190, render: (row) => row.sector ?? '—' },
  {
    key: 'cap',
    header: 'Mkt Cap ($B)',
    width: 130,
    align: 'right',
    render: (row) => billions(row.marketCap)
  }
]

/**
 * Strategy Builder → Universe Set. Figma 234:6348.
 *
 * Figma's table also carries ADV 3M, which needs a prices call per name — 512
 * of them for a large-cap universe — so it is left out rather than fetched at
 * that cost. Name, sector and market cap come from reference, which has the
 * same shape of problem; those are filled for the first DETAIL_LIMIT rows and
 * the footnote says so. See #45.
 */
export function UniverseView({ tab, subject }: ViewProps): ReactElement {
  const client = useBeacon()
  const universes = useUniverses()
  const setSubject = useWorkspace((state) => state.setSubject)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const catalogue = universes.data?.universes ?? []
  const selected = subject !== undefined && subject !== '' ? subject : (catalogue[0]?.id ?? '')
  const members = useUniverseMembers(selected)

  const identifiers = useMemo(() => members.data?.identifiers ?? [], [members.data])
  const detailed = useMemo(() => identifiers.slice(0, DETAIL_LIMIT), [identifiers])

  const references = useQueries({
    queries: detailed.map((identifier) => ({
      queryKey: keys.data.reference(identifier),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.data.reference(identifier, signal)
      },
      enabled: client !== null,
      retry: false
    }))
  })

  const rows = identifiers.map((identifier, index) =>
    buildRow(identifier, index + 1, references[index]?.data?.fields, index < DETAIL_LIMIT)
  )

  return (
    <div className="universe-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Select
          options={catalogue.map((universe) => ({ value: universe.id, label: universe.name }))}
          value={selected}
          placeholder="No universes"
          label="Universe"
          disabled={catalogue.length === 0}
          onChange={(value) => {
            setSubject(tab.id, value)
          }}
        />
      </PaneHeader>

      {universes.isPending && <ViewLoading what="universes" />}
      {universes.isError && <ViewError error={universes.error} />}
      {members.isError && <ViewError error={members.error} />}

      {universes.isSuccess && catalogue.length === 0 && (
        <ViewEmpty>This engine has no stored universes.</ViewEmpty>
      )}

      {members.isSuccess && identifiers.length === 0 && (
        <ViewEmpty>This universe has no members.</ViewEmpty>
      )}

      {identifiers.length > 0 && (
        <>
          <Table
            columns={COLUMNS}
            rows={rows}
            getRowId={(row) => row.ticker}
            onSelectRow={(row) => {
              openOrRetarget({
                page: 'data-explorer',
                viewKind: 'reference-data',
                title: 'Reference Data',
                subject: row.ticker
              })
            }}
            maxBodyHeight={620}
          />
          <p className="universe-footnote type-11">
            {identifiers.length.toLocaleString('en-US')} assets
            {identifiers.length > DETAIL_LIMIT &&
              ` · detail shown for the first ${String(DETAIL_LIMIT)} (py-beacon has no batch reference endpoint)`}{' '}
            · click a row to open Reference Data
          </p>
        </>
      )}
    </div>
  )
}
