import { Fragment, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { headingAt } from './tableGroups'

interface RowGroupsProps<T> {
  rows: readonly T[]
  getRowId: (row: T) => string
  rowGroup: (row: T) => string | undefined
  openGroups: readonly string[] | undefined
  renderRow: (row: T) => ReactElement
  rowFloor: CSSProperties | undefined
}

/**
 * The rows under their group headings, each heading folding its rows away
 * (Karan, 2026-11-23): a long table of figures, read a group at a time. The
 * groups named open start open, or all of them when none are named.
 */
export function RowGroups<T>({
  rows,
  getRowId,
  rowGroup,
  openGroups,
  renderRow,
  rowFloor
}: RowGroupsProps<T>): ReactElement {
  // The groups clicked away from how they start, so rows that arrive later start right too.
  const [turned, setTurned] = useState<ReadonlySet<string>>(new Set())
  const isOpen = (group: string): boolean =>
    (openGroups === undefined || openGroups.includes(group)) !== turned.has(group)
  const fold = (group: string): void => {
    setTurned((before) => {
      const after = new Set(before)
      if (!after.delete(group)) after.add(group)
      return after
    })
  }

  return (
    <>
      {rows.map((row, at) => {
        const group = rowGroup(row)
        const shown = group === undefined || isOpen(group) ? renderRow(row) : null
        const heading = headingAt(rows, at, rowGroup)
        if (heading === undefined) return shown
        const open = isOpen(heading)
        return (
          <Fragment key={getRowId(row)}>
            <div className="tbl-row-group" role="row" style={rowFloor}>
              <div className="tbl-cell" role="rowheader">
                <button
                  type="button"
                  className="tbl-row-group-toggle"
                  aria-expanded={open}
                  onClick={() => {
                    fold(heading)
                  }}
                >
                  <ChevronIcon size={14} className="tbl-row-group-chevron" />
                  {heading}
                </button>
              </div>
            </div>
            {shown}
          </Fragment>
        )
      })}
    </>
  )
}
