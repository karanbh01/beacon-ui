import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import './Table.css'

/*
 * 22px: py-beacon's lines table spacing at the app's text size — a line
 * height of 1.25 and a little padding above and below each row, so the
 * table reads as dense as the figures the engine exports.
 */
export const ROW_HEIGHT = 22

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
  /**
   * How far a filling table may narrow this column before it scrolls (BU-226).
   *
   * Omitted, the declared width is the floor, as it always was. A table that
   * has to fit a narrow pane gives each column a minimum, so the columns give
   * way first and the table scrolls sideways only once none of them can.
   */
  minWidth?: number
  /**
   * Let the header wrap onto a second line as the column narrows, rather than
   * ending in an ellipsis. For long labels, like the cap columns' units.
   */
  wrapHeader?: boolean
  align?: 'left' | 'right'
  /**
   * A heading over this column and its neighbours with the same one, as
   * py-beacon groups columns: "Index" over its Performance and Rel.
   * Performance. Neighbours only; the same name further along starts a
   * second group.
   */
  group?: string
  /** Regular weight in primary: identity and headline columns. Aligns as text. */
  emphasis?: boolean
  /**
   * The names of the rows in a table of figures, right-aligned against the
   * figures they name, as py-beacon sets them: "Total return", "Sharpe
   * ratio". Not for an identity column such as a ticker, which is text and
   * reads from the left.
   */
  rowName?: boolean
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
  /**
   * Share the pane's spare width out among the columns (BU-131).
   *
   * In proportion to the widths they are declared with, so the shape stays
   * as designed — and those widths become the minimum, so a narrow pane
   * scrolls rather than crushing Date into three characters.
   */
  fillWidth?: boolean
  /**
   * How many columns have to stay on screen before the table scrolls sideways
   * itself (BU-153).
   *
   * Without it a wide table makes the PANE scroll, which drags the paging and
   * the footnote off with it. With it the card fits the pane down to this many
   * columns and then scrolls its own body, the head following along — the same
   * bargain `minRows` makes vertically. Omit it for a table narrow enough that
   * the question never comes up.
   */
  minColumns?: number
  /**
   * Something in each header cell besides its label (BU-148).
   *
   * A render prop rather than filter semantics baked in here: the Database
   * view hangs a filter-and-sort menu off its labels, and every other table
   * in the app wants nothing there at all. The table stays a table.
   */
  renderHeader?: (column: Column<T>) => ReactNode
  /**
   * A control at the right end of the column names, such as a holdings
   * table's column chooser. It sits on the head rather than beside the
   * table, so every table puts it in the same place.
   */
  headerAction?: ReactNode
  caption?: string
  className?: string
}

/** `.tbl-head`'s own horizontal padding, which the gutter is added to. */
/** A row's inset at each end: py-beacon's cell padding, so the rules run just past the text. */
const SIDE = 4

/*
 * What a fixed-width table adds around its columns: when the body scrolls,
 * the scrollbar (Karan, 2026-10-18). Without it the rows came out wider than
 * the body by exactly that much, and every capped table grew a sideways
 * scrollbar for pixels nobody could see. The lines style has no box, so
 * there are no borders to allow for.
 */
const HEAD_PADDING = SIDE

/** Room kept at the end of every row for a header action, so it covers no column name. */
const ACTION_ROOM = 24

/** What the first `count` columns take, gaps and the card's padding included. */

function widthOf<T>(columns: readonly Column<T>[], count: number): number {
  const kept = columns.slice(0, Math.max(1, count))
  return kept.reduce((sum, column) => sum + column.width, 0) + 2 * SIDE + (kept.length - 1) * 10
}

/** The narrowest every column can go, gaps and padding included (BU-226). */
function floorOf<T>(columns: readonly Column<T>[]): number {
  const narrowest = columns.reduce((sum, column) => sum + (column.minWidth ?? column.width), 0)
  return narrowest + 2 * SIDE + Math.max(0, columns.length - 1) * 10
}

/**
 * The declared width, plus a share of anything left over when filling — and,
 * for a column with a minimum, a share of any shortfall down to it.
 */
function cellStyle<T>(column: Column<T>, fill: boolean): CSSProperties {
  if (!fill) return { width: column.width }
  const min = column.minWidth ?? column.width
  return {
    flexGrow: column.width,
    flexShrink: min < column.width ? column.width - min : 0,
    flexBasis: column.width,
    minWidth: min
  }
}

/** Neighbouring columns under one group heading, or under none. */
interface GroupRun<T> {
  key: string
  label: string | undefined
  columns: Column<T>[]
}

function groupRuns<T>(columns: readonly Column<T>[]): GroupRun<T>[] {
  const runs: GroupRun<T>[] = []
  for (const column of columns) {
    const last = runs[runs.length - 1]
    if (last !== undefined && column.group !== undefined && last.label === column.group) {
      last.columns.push(column)
      continue
    }
    runs.push({ key: column.key, label: column.group, columns: [column] })
  }
  return runs
}

/** A group heading spans its columns and the gaps between them. */
function groupStyle<T>(run: GroupRun<T>, fill: boolean): CSSProperties {
  const gaps = (run.columns.length - 1) * 10
  const width = run.columns.reduce((sum, column) => sum + column.width, 0) + gaps
  if (!fill) return { width }
  const min = run.columns.reduce((sum, column) => sum + (column.minWidth ?? column.width), 0)
  return { flexGrow: width, flexShrink: 0, flexBasis: width, minWidth: min + gaps }
}

function cellClasses<T>(column: Column<T>, header = false): string {
  return [
    'tbl-cell',
    column.align === 'right' && 'tbl-right',
    column.emphasis === true && 'tbl-emphasis',
    column.rowName === true && 'tbl-row-name',
    header && column.wrapHeader === true && 'tbl-wrap'
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * py-beacon's "lines" table (Karan, 2026-10-18): no box and no stripes; a
 * rule under the column names and under the last row in the secondary text
 * colour, and divider rules between rows. Values in Light.
 *
 * One alignment rule, header and values alike (Karan, 2026-10-19): text,
 * tickers included, from the left; numbers centred; the row names of a
 * table of figures right-aligned, as the engine's exported tables set them.
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
  fillWidth = false,
  minColumns,
  renderHeader,
  headerAction,
  caption,
  className
}: TableProps<T>): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const totalRef = useRef<HTMLDivElement>(null)
  const virtualize = rows.length > VIRTUALIZE_ABOVE

  /*
   * The header reserves whatever the body's scrollbar takes (BU-131).
   *
   * The head is outside the scrolling body, so its content box is wider by
   * the scrollbar — with fixed column widths that showed as the last column
   * being clipped, and with columns that GROW it spreads across all of them
   * and every header sits off its own numbers. Measured rather than assumed:
   * the width is the platform's, and it is 0 for an overlay scrollbar.
   */
  const [gutter, setGutter] = useState(0)
  useEffect(() => {
    const body = bodyRef.current
    if (body === null) return undefined

    const measure = (): void => {
      setGutter(body.offsetWidth - body.clientWidth)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => {
      observer.disconnect()
    }
  }, [rows.length, fillWidth])

  /*
   * The head and the total follow the body sideways (BU-153).
   *
   * Only the body scrolls — it is the one with a scrollbar to put somewhere —
   * so the two rows outside it are shifted to match. Written straight to the
   * node rather than through state: this fires on every scroll frame, and a
   * render per frame would be felt on a table of any size.
   */
  const followBody = (): void => {
    const shift = `translateX(${String(-(bodyRef.current?.scrollLeft ?? 0))}px)`
    if (headRef.current !== null) headRef.current.style.transform = shift
    if (groupRef.current !== null) groupRef.current.style.transform = shift
    if (totalRef.current !== null) totalRef.current.style.transform = shift
  }

  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const actionRoom = headerAction === undefined ? 0 : ACTION_ROOM
  const width = widthOf(columns, columns.length) + actionRoom
  // The floor a filling table may not shrink past. Never wider than the
  // table itself, or a five-column table would demand room for five and a
  // half of them.
  const floor = minColumns === undefined ? width : Math.min(widthOf(columns, minColumns), width)
  /*
   * Columns that can narrow (BU-226): the card fits whatever the pane gives
   * it, the columns give way down to their minimums, and past that the rows
   * stop narrowing and the body scrolls sideways under a head that follows.
   * Without a minimum anywhere, nothing here changes.
   */
  const shrinks = fillWidth && columns.some((column) => column.minWidth !== undefined)
  const rowFloor: CSSProperties | undefined = shrinks ? { minWidth: floorOf(columns) } : undefined
  const cardFloor = shrinks
    ? minColumns === undefined
      ? 0
      : Math.min(widthOf(columns, minColumns), floorOf(columns))
    : floor

  const renderRow = (row: T, offset?: number): ReactElement => {
    const id = getRowId(row)
    const selected = id === selectedId
    const classes = [
      'tbl-row',
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
            ? rowFloor
            : {
                ...rowFloor,
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
            style={cellStyle(column, fillWidth)}
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
      style={{
        ...(fillWidth ? { width: '100%', minWidth: cardFloor } : { width: width + gutter }),
        // Every row ends this far in, so the columns line up under a head
        // that keeps room for its action.
        ['--tbl-end' as string]: `${String(SIDE + actionRoom)}px`
      }}
      role="table"
    >
      {caption !== undefined && <span className="tbl-caption">{caption}</span>}

      {columns.some((column) => column.group !== undefined) && (
        <div
          className="tbl-groups"
          ref={groupRef}
          style={{ ...rowFloor, paddingRight: HEAD_PADDING + actionRoom + gutter }}
          aria-hidden="true"
        >
          {groupRuns(columns).map((run) => (
            <div
              key={run.key}
              className={run.label === undefined ? 'tbl-group' : 'tbl-group tbl-group-named'}
              style={groupStyle(run, fillWidth)}
            >
              {run.label}
            </div>
          ))}
        </div>
      )}

      <div
        className="tbl-head"
        role="row"
        ref={headRef}
        style={{ ...rowFloor, paddingRight: HEAD_PADDING + actionRoom + gutter }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cellClasses(column, true)}
            style={cellStyle(column, fillWidth)}
            role="columnheader"
          >
            {renderHeader === undefined ? column.header : renderHeader(column)}
          </div>
        ))}
        {headerAction !== undefined && <div className="tbl-head-action">{headerAction}</div>}
      </div>

      <div
        className="tbl-body"
        ref={bodyRef}
        onScroll={followBody}
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
              return row === undefined ? null : renderRow(row, item.start)
            })}
          </div>
        ) : (
          rows.map((row) => renderRow(row))
        )}
      </div>

      {totalRow !== undefined && (
        <div className="tbl-row tbl-total" role="row" ref={totalRef} style={rowFloor}>
          {columns.map((column) => (
            <div
              key={column.key}
              className={cellClasses(column)}
              style={cellStyle(column, fillWidth)}
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
