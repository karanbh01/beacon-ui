import type { ReactElement } from 'react'
import { Badge } from '../../components/Badge/Badge'
import { Table, type Column } from '../../components/Table/Table'
import './UniverseOverview.css'

export interface UniverseSummary {
  id: string
  name: string
  /**
   * Members still listed on the as-of date, not the stored membership size.
   * Undefined until the reference data answering that has arrived.
   */
  constituents: number | undefined
  /** `seeded` is the engine's own; anything else is the user's. */
  source: string | undefined
}

export interface UniverseOverviewProps {
  universes: readonly UniverseSummary[]
  /** The latest date the data reaches, which is what the counts are stated at. */
  asOf: string | undefined
  onOpen: (id: string) => void
  /** Omitted while a delete is in flight, or where deleting is not offered. */
  onDelete?: (universe: UniverseSummary) => void
}

const COLUMNS: readonly Column<UniverseSummary>[] = [
  { key: 'name', header: 'Universe', width: 200, emphasis: true, render: (row) => row.name },
  {
    key: 'source',
    header: 'Source',
    width: 90,
    // `mine` is the engine's word for "not seeded", and it reads as a note
    // to self rather than a description of the row (BU-147).
    render: (row) => (row.source === 'seeded' ? <Badge>Seeded</Badge> : <Badge>User created</Badge>)
  },
  {
    key: 'constituents',
    header: 'Constituents',
    width: 110,
    align: 'right',
    render: (row) => row.constituents?.toLocaleString('en-US') ?? '…'
  }
]

/** The as-of column is the same date in every row, so it is built per render. */
function columns(
  asOf: string | undefined,
  onDelete: ((universe: UniverseSummary) => void) | undefined
): readonly Column<UniverseSummary>[] {
  return [
    ...COLUMNS,
    { key: 'asOf', header: 'As of', width: 110, render: () => asOf ?? '—' },
    {
      key: 'delete',
      header: '',
      width: 60,
      align: 'right',
      /*
       * Nothing on a seeded row (BU-144).
       *
       * The engine refuses those, which is where the rule belongs — this is
       * a courtesy, so the button is not offered for something that will be
       * turned down.
       */
      render: (row) =>
        onDelete === undefined || row.source === 'seeded' ? null : (
          <button
            type="button"
            className="universe-delete type-11"
            aria-label={`Delete ${row.name}`}
            onClick={(event) => {
              // The row opens the universe; the button must not.
              event.stopPropagation()
              onDelete(row)
            }}
          >
            Delete
          </button>
        )
    }
  ]
}

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
 * **The count is point-in-time, not the stored list length.** A universe
 * document is a fixed list that outlives its members, so "how many
 * constituents does this have" and "how long is the saved list" are different
 * questions once anything has delisted. The column answers the first, at the
 * latest date the data reaches — the same date for every row, because it is a
 * property of the dataset rather than of any universe.
 *
 * That costs reference data for every name in every universe, which is why
 * `useReferenceValidity` deduplicates across universes and chunks to the
 * engine's 1,000-per-call cap rather than asking once per universe.
 */
export function UniverseOverview({
  universes,
  asOf,
  onOpen,
  onDelete
}: UniverseOverviewProps): ReactElement {
  const total = universes.reduce((sum, universe) => sum + (universe.constituents ?? 0), 0)

  return (
    <div className="universe-overview">
      <Table
        columns={columns(asOf, onDelete)}
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
        {asOf !== undefined && `, counted as of ${asOf}`} · click a row to open one
      </p>
    </div>
  )
}
