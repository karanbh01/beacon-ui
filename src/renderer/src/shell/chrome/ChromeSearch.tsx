import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { useTypeahead } from '../../components/Typeahead/useTypeahead'
import { usePresets } from '../../state/presets'
import { recentTabs } from '../../state/tabs.logic'
import { useWorkspace } from '../../state/tabs.store'
import { useIdentifierSearch } from '../../views/shared/useIdentifierSearch'
import { SearchDropdown } from './SearchDropdown'
import { allViews, type ViewOption } from '../viewRegistry'
import { recentRows, searchRows, type SearchRow } from './searchResults'
import { usePaletteIndices } from './usePaletteIndices'

export interface ChromeSearchProps {
  onSubmit?: (query: string) => void
  /** Given a row the user picked. */
  onSelectTab?: (id: string) => void
  /** An identifier row: open it somewhere sensible. */
  onOpenIdentifier?: (subject: string) => void
  /**
   * A view row, optionally pinned to a subject (BU-79). `page` comes with it
   * because opening a view means going to the page that holds it.
   */
  onOpenView?: (view: ViewOption, subject?: string) => void
  /** An index row: open it in its overview. */
  onOpenIndex?: (id: string) => void
  /**
   * A preset row: apply it, and go to the page it belongs to (BU-120).
   *
   * `subject` is set when the query named an instrument first — every
   * loadable tab in the arrangement opens on it (BU-122).
   */
  onApplyPreset?: (id: string, subject?: string) => void
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
  onOpenView,
  onOpenIndex,
  onApplyPreset,
  onCreateIndex
}: ChromeSearchProps): ReactElement {
  const [query, setQuery] = useState('')
  /**
   * Recents show on an empty query, but only while the field is FOCUSED.
   *
   * Without this the panel has rows whenever the workspace does, so it hangs
   * open over the pane permanently — the tests caught it immediately. Focus
   * is what turns "there is nothing typed" into "somebody is about to type".
   */
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const tabs = useWorkspace((state) => state.tabs)
  // Identifiers arrive already ranked (BN-127); searchRows keeps that order.
  const found = useIdentifierSearch(query)
  const indices = usePaletteIndices()
  const presets = usePresets((state) => state.presets)
  // Both selections are stable references; the sort is memoised because it
  // is not — see recentTabs.
  const activatedAt = useWorkspace((state) => state.activatedAt)
  const recent = useMemo(() => recentTabs(tabs, activatedAt), [tabs, activatedAt])

  // The empty query is not nothing: it is "what was I just doing" (BU-79).
  const rows =
    query.trim() === ''
      ? focused
        ? recentRows(recent)
        : []
      : searchRows(query, tabs, {
          identifiers: found.suggestions,
          indices,
          views: allViews(),
          presets
        })

  const activate = (row: SearchRow): void => {
    if (row.kind === 'tab') onSelectTab?.(row.id)
    else if (row.kind === 'identifier' && row.subject !== undefined) {
      onOpenIdentifier?.(row.subject)
    } else if (row.kind === 'view' && row.view !== undefined) {
      onOpenView?.(row.view, row.subject)
    } else if (row.kind === 'index' && row.subject !== undefined) {
      onOpenIndex?.(row.subject)
    } else if (row.kind === 'preset' && row.preset !== undefined) {
      onApplyPreset?.(row.preset, row.subject)
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

  /*
   * Tab finishes what is highlighted, in the field (BU-122).
   *
   * Completion is not activation: finishing "CMP0" into "CMP001" is how the
   * second half of `CMP001 DE001` gets typed at all, and opening the row
   * instead would take the query away before it could be finished. Falls back
   * to the first row, which is what every shell does with nothing selected.
   */
  const completion = (): string | undefined => {
    const row = rows[typeahead.active] ?? rows[0]
    if (row === undefined) return undefined
    if (row.kind === 'identifier' || row.kind === 'index') return row.subject
    if (row.kind === 'preset' && row.subject === undefined) return row.label
    return undefined
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Tab' && !event.shiftKey && open) {
      const filled = completion()
      if (filled !== undefined && filled !== query) {
        event.preventDefault()
        // A trailing space, because what follows a completed instrument is
        // usually the preset to load it into.
        setQuery(`${filled} `)
        typeahead.onInput()
        return
      }
    }
    typeahead.onKeyDown(event)
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
            {...(rows[typeahead.active] === undefined
              ? {}
              : { 'aria-activedescendant': `search-row-${rows[typeahead.active]?.id ?? ''}` })}
            spellCheck={false}
            /*
             * Chromium's own autofill dropdown opens over a field it has seen
             * a value in before, and eats Up and Down on its way past (BU-123)
             * — so the highlight moved under a test driving the element
             * directly and not under a person at a keyboard. `TickerField`
             * has always set this; this field never did.
             */
            autoComplete="off"

            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              typeahead.onInput()
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true)
            }}
            onBlur={() => {
              setFocused(false)
            }}
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
