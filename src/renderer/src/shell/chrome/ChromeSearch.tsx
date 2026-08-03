import { useRef, useState, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { useWorkspace } from '../../state/tabs.store'
import { SearchDropdown } from './SearchDropdown'
import { nextIndex, searchRows, type SearchRow } from './searchResults'

export interface ChromeSearchProps {
  onSubmit?: (query: string) => void
  /** Given a row the user picked. */
  onSelectTab?: (id: string) => void
  onCreateIndex?: (name: string) => void
}

/**
 * The menu bar's search field and its dropdown (Figma 81:68 + 147:13).
 *
 * Open-on-type, not open-on-submit: the panel appears on the first character
 * and disappears when the query is cleared. That is the whole point of a
 * typeahead — waiting for Enter makes it a search box with a delayed answer.
 */
export function ChromeSearch({
  onSubmit,
  onSelectTab,
  onCreateIndex
}: ChromeSearchProps): ReactElement {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [dismissed, setDismissed] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const tabs = useWorkspace((state) => state.tabs)
  const rows = searchRows(query, tabs)
  const open = rows.length > 0 && !dismissed

  const activate = (row: SearchRow): void => {
    if (row.kind === 'tab') {
      onSelectTab?.(row.id)
    } else {
      onCreateIndex?.(query.trim())
    }
    setQuery('')
    setActive(-1)
    input.current?.blur()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      // Stop, or the pane behind may also take it as a dismissal.
      event.stopPropagation()
      setDismissed(true)
      setActive(-1)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) return
      event.preventDefault()
      setActive((current) => nextIndex(current, event.key === 'ArrowDown' ? 1 : -1, rows.length))
      return
    }

    if (event.key !== 'Enter') return
    const row = rows[active]
    // With nothing highlighted, Enter is still a plain submit.
    if (open && row !== undefined) {
      activate(row)
      return
    }
    onSubmit?.(event.currentTarget.value)
  }

  return (
    <div className="menu-bar-search">
      {/*
        One rounded rectangle, not two. Figma 147:13 is a single container
        with one border and one 5px radius; the field row lives INSIDE it,
        above a full-width rule. Opening the search grows this box downwards
        rather than hanging a second box off the bottom of it.
      */}
      <div className={`menu-bar-search-surface${open ? ' menu-bar-search-surface-open' : ''}`}>
        <div className="menu-bar-search-row">
          <input
            ref={input}
            type="search"
            aria-label="Search"
            role="combobox"
            aria-expanded={open}
            aria-controls="search-results"
            aria-autocomplete="list"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setDismissed(false)
              setActive(-1)
            }}
            onKeyDown={onKeyDown}
          />

          {/* The chevron section on the field's right edge — 81:69 when
              closed, 147:17 when open. Inside the field, not out in the
              icon cluster. */}
          <span className="menu-bar-search-divider" aria-hidden="true" />
          <button
            type="button"
            className="menu-bar-search-chevron"
            aria-label="Search options"
            aria-expanded={open}
            onClick={() => {
              setDismissed((was) => !was)
              input.current?.focus()
            }}
          >
            <ChevronIcon size={24} />
          </button>
        </div>

        {open && (
          <>
            <span className="menu-bar-search-rule" aria-hidden="true" />
            <SearchDropdown
              rows={rows}
              activeIndex={active}
              onActivate={activate}
              onHover={setActive}
            />
          </>
        )}
      </div>
    </div>
  )
}
