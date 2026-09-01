import { useEffect, useRef, type ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { isDateColumn, type ColumnQuery } from './database'
import './ColumnMenu.css'

export interface ColumnMenuProps {
  column: string
  query: ColumnQuery
  /**
   * True for the one column the ENGINE can narrow (BU-148).
   *
   * `identifiers` is the only predicate `/data/tables/{dataset}` takes, so
   * that column's filter changes the request while every other column's
   * narrows the page already fetched. The menu says which it is doing,
   * because on an eleven-million-row table the difference is the difference
   * between a filter that works and one that looks broken.
   */
  narrowsRequest: boolean
  onChange: (query: ColumnQuery) => void
  onClose: () => void
}

/**
 * A column's own menu: filter, range, sort (BU-148).
 *
 * Hung off the label rather than sat in a row of boxes under the header —
 * a row of inputs is furniture the eye has to pass on the way to the data,
 * and it can only ever offer one kind of filtering. A menu can hold the
 * three that matter and say what each of them reaches.
 */
export function ColumnMenu({
  column,
  query,
  narrowsRequest,
  onChange,
  onClose
}: ColumnMenuProps): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const dated = isDateColumn(column)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Element
      if (box.current?.contains(target) === true) return
      // The label toggles this menu, so a click there must not also close it
      // here — it would close and reopen in one gesture.
      if (target.closest('.database-column-button') !== null) return
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
  }, [onClose])

  // `undefined` means "drop this", which under exactOptionalPropertyTypes a
  // plain spread cannot express — the key has to go, not hold undefined.
  const set = (patch: { [K in keyof ColumnQuery]?: ColumnQuery[K] | undefined }): void => {
    const merged = { ...query, ...patch }
    const kept = Object.entries(merged).filter(([, value]) => value !== undefined)
    onChange(Object.fromEntries(kept))
  }

  return (
    <div className="column-menu" role="dialog" aria-label={`${column} options`} ref={box}>
      <p className="column-menu-title type-11">{column}</p>

      <div className="column-menu-sort">
        {(['asc', 'desc'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            className={`column-menu-sort-button type-11${
              query.sort === direction ? ' column-menu-sort-active' : ''
            }`}
            aria-pressed={query.sort === direction}
            onClick={() => {
              // Pressing the active direction turns sorting off, which is
              // the third state and the only way back to the engine's order.
              set({ sort: query.sort === direction ? undefined : direction })
            }}
          >
            {direction === 'asc' ? 'Sort ↑' : 'Sort ↓'}
          </button>
        ))}
      </div>

      {dated && (
        <div className="column-menu-range">
          <Field label="From" width={124}>
            <input
              className="column-menu-input"
              type="date"
              aria-label={`${column} from`}
              value={query.from ?? ''}
              onChange={(event) => {
                set({ from: event.target.value })
              }}
            />
          </Field>
          <Field label="To" width={124}>
            <input
              className="column-menu-input"
              type="date"
              aria-label={`${column} to`}
              value={query.to ?? ''}
              onChange={(event) => {
                set({ to: event.target.value })
              }}
            />
          </Field>
        </div>
      )}

      <Field label={dated ? 'Contains' : 'Filter'} width={260}>
        <input
          className="column-menu-input"
          aria-label={`Filter ${column}`}
          placeholder={dated ? 'text' : 'text, or >100'}
          spellCheck={false}
          value={query.filter ?? ''}
          onChange={(event) => {
            set({ filter: event.target.value })
          }}
        />
      </Field>

      <p className="column-menu-note type-11">
        {narrowsRequest
          ? 'Narrows the request: the engine filters before paging.'
          : 'Narrows the rows on this page. The engine takes no filter but the identifier.'}
      </p>

      <button
        type="button"
        className="column-menu-clear type-11"
        onClick={() => {
          onChange({})
        }}
      >
        Clear
      </button>
    </div>
  )
}
