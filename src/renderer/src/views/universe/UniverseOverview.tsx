import type { ReactElement } from 'react'
import { Badge } from '../../components/Badge/Badge'
import { Table, type Column } from '../../components/Table/Table'
import './UniverseOverview.css'

export interface UniverseSummary {
  id: string
  name: string
  description: string | null | undefined
  /** Stored membership size — the engine sends the whole list with the row. */
  constituents: number
  /** `seeded` is the engine's own; anything else is the user's. */
  source: string | undefined
}

export interface UniverseOverviewProps {
  universes: readonly UniverseSummary[]
  /** The date the counts are current to. Same for every row — see below. */
  asOf: string | undefined
  onOpen: (id: string) => void
}

const COLUMNS: readonly Column<UniverseSummary>[] = [
  { key: 'name', header: 'Universe', width: 200, emphasis: true, render: (row) => row.name },
  {
    key: 'source',
    header: 'Source',
    width: 90,
    render: (row) => (row.source === 'seeded' ? <Badge>Seeded</Badge> : <Badge>Mine</Badge>)
  },
  {
    key: 'constituents',
    header: 'Constituents',
    width: 110,
    align: 'right',
    render: (row) => row.constituents.toLocaleString('en-US')
  },
  {
    key: 'description',
    header: 'Description',
    width: 320,
    render: (row) => row.description ?? '—'
  }
]

/**
 * What universes exist (BU-93).
 *
 * The view used to open on `catalogue[0]`, which on any real engine is the
 * seeded GLOBAL — so the first thing the tab showed was five thousand rows of
 * a universe nobody asked for, and nothing anywhere answered "what universes
 * do I have?".
 *
 * The counts are free: `GET /universes` returns each universe's whole
 * `identifiers` array alongside its name, so there is no per-universe call
 * and no fan-out.
 *
 * **The as-of is the DATASET's date, not each universe's.** py-beacon records
 * no timestamp on a universe document — no created, no updated — so there is
 * nothing per-row to show. For a seeded universe the dataset's date is
 * genuinely its date; for one the user saved it is not, and the caption says
 * which rather than implying a freshness the API cannot support. A real
 * per-universe date needs an engine change; see
 * `docs/engine-requests/reference-dimensions.md`.
 */
export function UniverseOverview({ universes, asOf, onOpen }: UniverseOverviewProps): ReactElement {
  const total = universes.reduce((sum, universe) => sum + universe.constituents, 0)

  return (
    <div className="universe-overview">
      <Table
        columns={COLUMNS}
        rows={universes}
        getRowId={(row) => row.id}
        onSelectRow={(row) => {
          onOpen(row.id)
        }}
        maxBodyHeight={520}
      />
      <p className="universe-footnote type-11">
        {universes.length.toLocaleString('en-US')} universe
        {universes.length === 1 ? '' : 's'} · {total.toLocaleString('en-US')} memberships
        {asOf !== undefined && ` · data current to ${asOf}`} · click a row to open one
      </p>
    </div>
  )
}
