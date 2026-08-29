import { useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import './Table.css'

export const ROW_HEIGHT = 28

/**
 * Above this many rows the body virtualises. Below it, plain DOM keeps
 * scrolling native and avoids the measurement cost for no benefit.
 */
export const VIRTUALIZE_ABOVE = 200

export interface Column<T> {
  key: string
  header: ReactNode
  /** Fixed px width. Tables here hug their content rather than fluid-fill. */
  width: number
  align?: 'left' | 'right'
  /** Medium weight in primary — identity and headline columns. */
  emphasis?: boolean
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: readonly Column<T>[]
  rows: readonly T[]
  getRowId: (row: T) => string
  /** Full-row wash, never a chip or border highlight (taxonomy 5). */
  selectedId?: string
  onSelectRow?: (row: T) => void
  /** Top-divided, Medium. Cells render from the same column defs. */
  totalRow?: Partial<Record<string, ReactNode>>
  /** Caps the body and turns on scrolling. Omit to render at full height. */
  maxBodyHeight?: number
  /**
   * Take the height the parent gives, down to `minRows` (BU-127).
   *
   * For a table in a pane rather than on a page: a fixed cap is either taller
   * than a short pane — so the pane scrolls instead of the table — or shorter
   * than a tall one, wasting the space below. The parent has to be a flex
   * column with `min-height: 0`; everything else is here.
   */
  fillHeight?: boolean
  /** Floor for `fillHeight`. Below this there is not enough table to read. */
  minRows?: number
  caption?: string
  className?: string
}

function cellClasses<T>(column: Column<T>): string {
  return [
    'tbl-cell',
    column.align === 'right' && 'tbl-right',
    column.emphasis === true && 'tbl-emphasis'
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Hug-width card table (taxonomy 9): surface card at radius 6, 28px rows,
 * zebra via canvas, 10px muted head over a divider, numerics right-aligned
 * with signed colouring supplied by the column's render.
 *
 * Virtualises past VIRTUALIZE_ABOVE rows so a 10k-row set scrolls without
 * putting 10k nodes in the DOM.
 */
export function Table<T>({
  columns,
  rows,
  getRowId,
  selectedId,
  onSelectRow,
  totalRow,
  maxBodyHeight,
  fillHeight = false,
  minRows = 5,
  caption,
  className
}: TableProps<T>): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)
  const virtualize = rows.length > VIRTUALIZE_ABOVE

  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const width =
    columns.reduce((sum, column) => sum + column.width, 0) + 32 + (columns.length - 1) * 10

  const renderRow = (row: T, index: number, offset?: number): ReactElement => {
    const id = getRowId(row)
    const selected = id === selectedId
    const classes = [
      'tbl-row',
      index % 2 === 1 && 'tbl-zebra',
      selected && 'tbl-selected',
      onSelectRow !== undefined && 'tbl-clickable'
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        key={id}
        className={classes}
        role="row"
        aria-selected={onSelectRow === undefined ? undefined : selected}
        onClick={
          onSelectRow === undefined
            ? undefined
            : () => {
                onSelectRow(row)
              }
        }
        style={
          offset === undefined
            ? undefined
            : {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${String(offset)}px)`
              }
        }
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cellClasses(column)}
            style={{ width: column.width }}
            role="cell"
          >
            {column.render(row)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={['tbl', fillHeight && 'tbl-fill', className].filter(Boolean).join(' ')}
      style={{ width }}
      role="table"
    >
      {caption !== undefined && <span className="tbl-caption">{caption}</span>}

      <div className="tbl-head" role="row">
        {columns.map((column) => (
          <div
            key={column.key}
            className={cellClasses(column)}
            style={{ width: column.width }}
            role="columnheader"
          >
            {column.header}
          </div>
        ))}
      </div>

      <div
        className="tbl-body"
        ref={bodyRef}
        style={
          fillHeight
            ? { minHeight: minRows * ROW_HEIGHT, overflowY: 'auto' }
            : maxBodyHeight === undefined
              ? undefined
              : { maxHeight: maxBodyHeight, overflowY: 'auto' }
        }
      >
        {virtualize ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              return row === undefined ? null : renderRow(row, item.index, item.start)
            })}
          </div>
        ) : (
          rows.map((row, index) => renderRow(row, index))
        )}
      </div>

      {totalRow !== undefined && (
        <div className="tbl-row tbl-total" role="row">
          {columns.map((column) => (
            <div
              key={column.key}
              className={cellClasses(column)}
              style={{ width: column.width }}
              role="cell"
            >
              {totalRow[column.key]}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
