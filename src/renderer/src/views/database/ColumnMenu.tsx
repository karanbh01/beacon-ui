import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { TickerField } from '../../components/TickerField/TickerField'
import { isDateColumn, isIdentifierColumn, sameQuery, type ColumnQuery } from './database'
import './ColumnMenu.css'

export interface ColumnMenuProps {
  column: string
  /** What this column is asking for now — the applied query, not the draft. */
  query: ColumnQuery
  onChange: (query: ColumnQuery) => void
  onClose: () => void
}

/** Clear of the window's edge, and of the label the panel hangs from. */
const EDGE = 8
const DROP = 4

/**
 * A patch, with `undefined` meaning "drop this key".
 *
 * Under exactOptionalPropertyTypes a spread cannot express that: the key has
 * to go rather than hold undefined, or `sameQuery` sees a field that is
 * present and empty and Apply lights up over nothing.
 */
function patched(
  query: ColumnQuery,
  patch: { [K in keyof ColumnQuery]?: ColumnQuery[K] | undefined }
): ColumnQuery {
  const merged = { ...query, ...patch }
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined))
}

/**
 * A column's own menu: filter, range, sort (BU-148).
 *
 * Hung off the label rather than sat in a row of boxes under the header — a
 * row of inputs is furniture the eye has to pass on the way to the data, and
 * it can only ever offer one kind of filtering.
 *
 * **Nothing takes effect until Apply (BU-154).** It used to apply on every
 * keystroke, so typing CMP001 asked five questions on the way to the one that
 * was meant — and on the identifier column each of those is a request to the
 * engine. The menu holds a draft and hands it over once.
 */
export function ColumnMenu({ column, query, onChange, onClose }: ColumnMenuProps): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | undefined>(undefined)
  const [draft, setDraft] = useState<ColumnQuery>(query)
  const dated = isDateColumn(column)
  const identifies = isIdentifierColumn(column)

  /*
   * The panel is a child of the document, placed over its column (BU-153).
   *
   * It used to sit inside the header row, which stopped working the day that
   * row started scrolling sideways: the panel travelled with it and off the
   * card, and what was left the card clipped. Measured rather than declared,
   * so a menu on the last column comes back inside the window instead of
   * hanging over its edge.
   */
  useLayoutEffect(() => {
    const cell = anchor.current?.closest('[role="columnheader"]')
    const panel = box.current
    if (cell === null || cell === undefined || panel === null) return
    const rect = cell.getBoundingClientRect()
    const left = Math.min(rect.left, window.innerWidth - panel.offsetWidth - EDGE)
    setPlace({ top: rect.bottom + DROP, left: Math.max(EDGE, left) })
  }, [])

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
    // Any scroll: the panel is fixed to the window and its column is not, so
    // it would otherwise sit over a different column than the one it names.
    document.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const set = (patch: { [K in keyof ColumnQuery]?: ColumnQuery[K] | undefined }): void => {
    setDraft((current) => patched(current, patch))
  }

  const apply = (next: ColumnQuery): void => {
    onChange(next)
    onClose()
  }

  // Hidden rather than off-screen until measured: one layout pass, no flash
  // of a panel in the corner.
  const style: CSSProperties =
    place === undefined ? { visibility: 'hidden' } : { top: place.top, left: place.left }

  const panel = (
    <div
      className="column-menu"
      role="dialog"
      aria-label={`${column} options`}
      ref={box}
      style={style}
    >
      <p className="column-menu-title type-11">{column}</p>

      <div className="column-menu-sort">
        {(['asc', 'desc'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            className={`column-menu-sort-button type-11${
              draft.sort === direction ? ' column-menu-sort-active' : ''
            }`}
            aria-pressed={draft.sort === direction}
            onClick={() => {
              // Pressing the active direction turns sorting off, which is the
              // third state and the only way back to the engine's order.
              set({ sort: draft.sort === direction ? undefined : direction })
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
              value={draft.from ?? ''}
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
              value={draft.to ?? ''}
              onChange={(event) => {
                set({ to: event.target.value })
              }}
            />
          </Field>
        </div>
      )}

      {identifies ? (
        /*
          The query bar's own field, suggestions and all (BU-154).

          This is the one column whose values the engine knows, and the one
          whose filter becomes a request — a name typed here that does not
          exist costs a round trip and comes back empty. Enter or a chosen
          suggestion commits, as everywhere else in the app; `onDraft` is what
          keeps Apply honest for a value that was only typed.
        */
        <div className="column-menu-ticker">
          <span className="column-menu-label">Filter</span>
          <TickerField
            // The APPLIED filter, not the draft: the field suppresses the
            // suggestion that matches what is already on screen, and a
            // subject that followed every keystroke would match all of them.
            subject={query.filter ?? ''}
            label={`Filter ${column}`}
            onDraft={(value) => {
              set({ filter: value })
            }}
            onQuery={(value) => {
              apply(patched(draft, { filter: value }))
            }}
          />
        </div>
      ) : (
        <Field label={dated ? 'Contains' : 'Filter'} width={260}>
          <input
            className="column-menu-input"
            aria-label={`Filter ${column}`}
            placeholder={dated ? 'text' : 'text, or >100'}
            spellCheck={false}
            value={draft.filter ?? ''}
            onChange={(event) => {
              set({ filter: event.target.value })
            }}
            onKeyDown={(event) => {
              // Enter is Apply, as it is in every form.
              if (event.key === 'Enter') apply(draft)
            }}
          />
        </Field>
      )}

      <div className="column-menu-actions">
        <Button
          variant="accent"
          disabled={sameQuery(draft, query)}
          onClick={() => {
            apply(draft)
          }}
        >
          Apply
        </Button>
        <button
          type="button"
          className="column-menu-clear type-11"
          onClick={() => {
            // Clearing is an answer in itself, so it applies rather than
            // staging an empty draft the reader would then have to confirm.
            setDraft({})
            apply({})
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Stays in the header cell, so the panel can find the column it belongs to. */}
      <span ref={anchor} hidden />
      {createPortal(panel, document.body)}
    </>
  )
}
