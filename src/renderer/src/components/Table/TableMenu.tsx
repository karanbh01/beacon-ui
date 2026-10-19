import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Checkbox } from '../Checkbox/Checkbox'
import {
  asText,
  FEW_VALUES,
  type CellValue,
  type ColumnFilter,
  type SortDirection
} from './tableQuery'
import './TableMenu.css'

interface TableMenuProps {
  /** The header cell it hangs from. */
  anchor: HTMLElement
  /** Every row's value in this column, to offer the ones there are. */
  values: readonly CellValue[]
  filter: ColumnFilter | undefined
  sort: SortDirection | undefined
  onFilter: (filter: ColumnFilter | undefined) => void
  onSort: (direction: SortDirection | undefined) => void
  /** Drop this column's filter and sort together. */
  onClear: () => void
  onClose: () => void
}

/** Clear of the window's edge, and of the name it hangs from. */
const EDGE = 8
const DROP = 4

/**
 * A results table's column menu: sort it, or keep only some of its rows
 * (Karan, 2026-10-19). Applies as it is changed, since the rows are already
 * here and nothing is asked of the engine.
 *
 * The filter fits the column: a range for numbers, in the units shown; a
 * tick list for a column with few values, such as a sector or whether a
 * name passed a rule; a contains box for anything else.
 */
export function TableMenu({
  anchor,
  values,
  filter,
  sort,
  onFilter,
  onSort,
  onClear,
  onClose
}: TableMenuProps): ReactElement {
  // Bumped by Clear, so the range boxes empty rather than keep what was typed.
  const [cleared, setCleared] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | undefined>(undefined)

  useLayoutEffect(() => {
    const panel = box.current
    if (panel === null) return
    const rect = anchor.getBoundingClientRect()
    const left = Math.min(rect.left, window.innerWidth - panel.offsetWidth - EDGE)
    setPlace({ top: rect.bottom + DROP, left: Math.max(EDGE, left) })
  }, [anchor])

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (box.current?.contains(target) === true || anchor.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  const shown = values.filter((value) => value !== null && value !== undefined && value !== '')
  const numeric = shown.length > 0 && shown.every((value) => typeof value === 'number')
  const distinct = useMemo(() => [...new Set(values.map(asText))].sort(), [values])

  return createPortal(
    <div
      ref={box}
      className="table-menu"
      role="dialog"
      aria-label="Sort and filter"
      style={place ?? { visibility: 'hidden' }}
    >
      <div className="table-menu-sort">
        {(['asc', 'desc'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            className={sort === direction ? 'table-menu-option table-menu-on' : 'table-menu-option'}
            aria-pressed={sort === direction}
            onClick={() => {
              onSort(sort === direction ? undefined : direction)
            }}
          >
            {direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
          </button>
        ))}
      </div>

      {numeric && <Range key={cleared} filter={filter} onFilter={onFilter} />}
      {!numeric && distinct.length <= FEW_VALUES && (
        <Ticks distinct={distinct} filter={filter} onFilter={onFilter} />
      )}
      {!numeric && distinct.length > FEW_VALUES && (
        <input
          className="table-menu-input"
          aria-label="Contains"
          placeholder="Contains"
          value={filter?.text ?? ''}
          onChange={(event) => {
            onFilter(event.target.value === '' ? undefined : { text: event.target.value })
          }}
        />
      )}

      <div className="table-menu-footer">
        <button
          type="button"
          className="table-menu-option"
          onClick={() => {
            onClear()
            setCleared((count) => count + 1)
          }}
        >
          Clear
        </button>
      </div>
    </div>,
    document.body
  )
}

function Range({
  filter,
  onFilter
}: {
  filter: ColumnFilter | undefined
  onFilter: (filter: ColumnFilter | undefined) => void
}): ReactElement {
  const bound = (key: 'min' | 'max', text: string): void => {
    const typed = text.trim() === '' ? undefined : Number(text)
    const value = typed === undefined || Number.isNaN(typed) ? undefined : typed
    const min = key === 'min' ? value : filter?.min
    const max = key === 'max' ? value : filter?.max
    onFilter(
      min === undefined && max === undefined
        ? undefined
        : { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
    )
  }
  return (
    <div className="table-menu-range">
      <input
        className="table-menu-input"
        aria-label="At least"
        placeholder="At least"
        inputMode="decimal"
        defaultValue={filter?.min ?? ''}
        onChange={(event) => {
          bound('min', event.target.value)
        }}
      />
      <input
        className="table-menu-input"
        aria-label="At most"
        placeholder="At most"
        inputMode="decimal"
        defaultValue={filter?.max ?? ''}
        onChange={(event) => {
          bound('max', event.target.value)
        }}
      />
    </div>
  )
}

function Ticks({
  distinct,
  filter,
  onFilter
}: {
  distinct: readonly string[]
  filter: ColumnFilter | undefined
  onFilter: (filter: ColumnFilter | undefined) => void
}): ReactElement {
  const kept = filter?.values ?? distinct
  return (
    <div className="table-menu-ticks">
      {distinct.map((value) => (
        <Checkbox
          key={value}
          label={value}
          checked={kept.includes(value)}
          onChange={(checked) => {
            const next = checked ? [...kept, value] : kept.filter((each) => each !== value)
            // Every value ticked is no filter at all.
            onFilter(next.length === distinct.length ? undefined : { values: next })
          }}
        />
      ))}
    </div>
  )
}
