import type { ReactElement, ReactNode } from 'react'
import { Table, type Column } from '../../components/Table/Table'
import { cellText, columnOf, dayOf, missingOf, partOf, signTone, type ProfileRow } from './profile'
import type { InstrumentProfile } from '../shared/beaconQueries'

/** A column of a part to show, and how wide; `signed` colours it by sign. */
export interface Shown {
  name: string
  width?: number
  signed?: boolean
  /** In place of the engine's label, where it is long for the column. */
  header?: string
}

/**
 * A part of the profile as a table: its date first, then the columns asked
 * for, each in the label and unit the engine gives it. Newest first, since
 * what the name did last is what a reader asks about first. A part the run
 * cannot give says why.
 */
export function ProfileTable({
  profile,
  part: name,
  shown,
  dateHeader = 'Date',
  maxBodyHeight = 300,
  extra
}: {
  profile: InstrumentProfile | undefined
  part: string
  shown: readonly Shown[]
  dateHeader?: string
  maxBodyHeight?: number
  /** One more column of the caller's, after the part's. */
  extra?: Column<ProfileRow & { id: string }>
}): ReactElement {
  const part = partOf(profile, name)
  if (part === undefined)
    return <p className="drilldown-none type-11">{missingOf(profile, name)}</p>
  if (part.rows.length === 0) return <p className="drilldown-none type-11">None over this run.</p>
  const currency = profile?.currency ?? ''
  const rows = part.rows.map((row, at) => ({ ...row, id: `${row.date}-${String(at)}` })).reverse()
  const columns: Column<ProfileRow & { id: string }>[] = [
    { key: 'date', header: dateHeader, width: 86, render: (row) => dayOf(row.date) },
    ...shown
      .filter((each) => columnOf(part, each.name) !== undefined)
      .map((each): Column<ProfileRow & { id: string }> => {
        const column = columnOf(part, each.name)
        const numeric = column?.unit != null
        return {
          key: each.name,
          header: each.header ?? column?.label ?? each.name,
          width: each.width ?? 90,
          align: numeric ? 'right' : 'left',
          wrapHeader: true,
          render: (row): ReactNode => {
            const value = row.values[each.name] ?? null
            return (
              <span className={each.signed === true ? signTone(value) : undefined}>
                {cellText(column, value, currency)}
              </span>
            )
          }
        }
      }),
    ...(extra === undefined ? [] : [extra])
  ]
  return (
    <Table columns={columns} rows={rows} getRowId={(row) => row.id} maxBodyHeight={maxBodyHeight} />
  )
}
