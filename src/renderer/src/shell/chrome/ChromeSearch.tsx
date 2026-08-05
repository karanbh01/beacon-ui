import { useRef, useState, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { useTypeahead } from '../../components/Typeahead/useTypeahead'
import { useWorkspace } from '../../state/tabs.store'
import { useIdentifierSearch } from '../../views/shared/useIdentifierSearch'
import { SearchDropdown } from './SearchDropdown'
import { searchRows, type SearchRow } from './searchResults'

export interface ChromeSearchProps {
  onSubmit?: (query: string) => void
  /** Given a row the user picked. */
  onSelectTab?: (id: string) => void
  /** An identifier row: open it somewhere sensible. */
  onOpenIdentifier?: (subject: string) => void
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
  onOpenIdentifier,
  onCreateIndex
}: ChromeSearchProps): ReactElement {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const tabs = useWorkspace((state) => state.tabs)
  // Identifiers arrive already ranked (BN-127); searchRows keeps that order.
  const found = useIdentifierSearch(query)
  const rows = searchRows(query, tabs, found.suggestions)

  const activate = (row: SearchRow): void => {
    if (row.kind === 'tab') onSelectTab?.(row.id)
    else if (row.kind === 'identifier' && row.subject !== undefined) {
      onOpenIdentifier?.(row.subject)
    } else onCreateIndex?.(query.trim())

    setQuery('')
    input.current?.blur()
  }

  // The keyboard model is shared with the query bar's typeahead (BU-68) —
  // open on type, ↑/↓, Enter takes the highlight or falls through to submit.
  const typeahead = useTypeahead({
    count: rows.length,
    onActivate: (index) => {
      const row = rows[index]
      if (row !== undefined) activate(row)
    },
    onSubmit: () => {
      onSubmit?.(query)
    }
  })

  const open = typeahead.open

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
              typeahead.onInput()
            }}
            onKeyDown={typeahead.onKeyDown}
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
              if (open) typeahead.close()
              else typeahead.onInput()
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
              activeIndex={typeahead.active}
              onActivate={activate}
              onHover={typeahead.setActive}
            />
          </>
        )}
      </div>
    </div>
  )
}
