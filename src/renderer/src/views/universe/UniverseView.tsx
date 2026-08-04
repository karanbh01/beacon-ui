import { useMemo, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useUniverseMembers, useUniverses } from '../shared/strategyQueries'
import { REFERENCE_BATCH_LIMIT, useReferenceBatch } from '../shared/queries'
import { billions, buildRow, fieldsByIdentifier, volume, type UniverseRow } from './universe'
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
    header: 'FF Mkt Cap ($B)',
    width: 130,
    align: 'right',
    render: (row) => billions(row.marketCap)
  },
  { key: 'adv', header: 'ADV 3M', width: 100, align: 'right', render: (row) => volume(row.adv) }
]

/**
 * Strategy Builder → Universe Set. Figma 234:6348.
 *
 * Every column the frame draws, from one request. This table used to fan out
 * a reference call per name and stop at 60, with a footnote explaining why —
 * `/data/reference` takes a list now (#45).
 *
 * ADV 3M comes back too, and not because of the batching: it is a DERIVED
 * field, returned only when named in `fields`. The endpoint's default is
 * stored columns, so asking for everything would still not have produced it.
 */
export function UniverseView({ tab, subject, pane }: ViewProps): ReactElement {
  const universes = useUniverses()
  const setSubject = useWorkspace((state) => state.setSubject)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const catalogue = universes.data?.universes ?? []
  const selected = subject !== undefined && subject !== '' ? subject : (catalogue[0]?.id ?? '')
  const members = useUniverseMembers(selected)

  const identifiers = useMemo(() => members.data?.identifiers ?? [], [members.data])

  // One request for the whole universe, where this was a useQueries fan-out
  // of one call per name that stopped at 60.
  const reference = useReferenceBatch(identifiers)
  const byIdentifier = useMemo(
    () => fieldsByIdentifier(reference.data?.entries ?? []),
    [reference.data]
  )

  const rows = identifiers.map((identifier, index) =>
    buildRow(identifier, index + 1, byIdentifier.get(identifier), byIdentifier.has(identifier))
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
                pane,
                viewKind: 'reference-data',
                title: 'Reference Data',
                subject: row.ticker
              })
            }}
            maxBodyHeight={620}
          />
          <p className="universe-footnote type-11">
            {identifiers.length.toLocaleString('en-US')} assets
            {identifiers.length > REFERENCE_BATCH_LIMIT &&
              ` · detail for the first ${REFERENCE_BATCH_LIMIT.toLocaleString('en-US')}, which is py-beacon's cap per call`}{' '}
            · click a row to open Reference Data
          </p>
        </>
      )}
    </div>
  )
}
