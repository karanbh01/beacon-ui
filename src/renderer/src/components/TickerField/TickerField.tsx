import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import { useIdentifierIndex } from '../../views/shared/identifierIndex'
import { useIdentifierSearch } from '../../views/shared/useIdentifierSearch'
import { useTypeahead } from '../Typeahead/useTypeahead'
import { mergeSuggestions, unavailableFor } from './suggestions'
import { useLinkTargets } from './useLinkTargets'
import './TickerField.css'

export interface TickerFieldProps {
  /** The subject on screen now, e.g. "AAPL". */
  subject: string
  /**
   * When set, this field follows another tab's subject. The chain shows and
   * typing severs the link (taxonomy 2).
   */
  linkedTo?: string
  /** Enter pressed on an edited value, or a suggestion chosen. */
  onQuery: (subject: string) => void
  /**
   * Typing while linked. The tab becomes an independent query view; BU-16's
   * store consumes this. Fires once per link, on the first keystroke.
   */
  onSever?: () => void
  /**
   * Dataset this view needs, e.g. `market` for prices. A suggestion the
   * engine says it does not cover is shown and marked rather than hidden —
   * the identifier is real, and silently dropping it would look like the
   * search failing.
   */
  requires?: string
  label?: string
  className?: string
  /**
   * Enables the link control (BU-104). Without it the field is just a search
   * box — Storybook and the tests that predate linking pass nothing.
   */
  tabId?: string
}

/** Modifier and navigation keys must not count as "typing". */
function isTypingKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete'
}

/**
 * Figma 388:11440. The query bar for subject-bearing views.
 *
 * Linked state is the interesting one: the chain says the subject is not
 * ours, and the hint tells you how to take ownership. Severing is
 * deliberately driven by typing rather than a control, because that is the
 * gesture a user already reaches for (taxonomy 2).
 *
 * Since BU-68 it suggests as you type, in the same shape as the menu bar's
 * search (Figma 147:13): ONE rounded rectangle that grows downward, not a
 * panel hung off the bottom of a field.
 */
export function TickerField({
  subject,
  linkedTo,
  onQuery,
  onSever,
  requires,
  label,
  className,
  tabId
}: TickerFieldProps): ReactElement {
  const [draft, setDraft] = useState(subject)
  const [linksOpen, setLinksOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const local = useIdentifierIndex()
  const linkage = useLinkTargets(tabId ?? '')

  /*
   * The STORE decides whether this tab follows another, not the caller.
   *
   * `linkedTo` is passed by two views out of six, so a Reference Data tab
   * could be genuinely linked — chain on the tab strip, subject inherited —
   * while its own field showed "Link this tab". Two sources of truth for one
   * fact, and the wrong one was nearer the control.
   */
  const source = linkage.linkedTo ?? linkedTo
  const linked = source !== undefined

  // Click-away and Escape for the link panel. Bound to the document because
  // the click that should dismiss it can land anywhere.
  useEffect(() => {
    if (!linksOpen) return undefined

    // Qualified: this file imports React's KeyboardEvent, so the bare names
    // mean the synthetic types rather than the DOM ones.
    const onDown = (event: globalThis.MouseEvent): void => {
      if (box.current?.contains(event.target as Node) === true) return
      setLinksOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setLinksOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [linksOpen])

  // A linked field mirrors its source, so an upstream change must show here
  // even while this input is mounted and untouched.
  useEffect(() => {
    setDraft(subject)
  }, [subject])

  // Never suggest the thing already on screen — the whole list would be one
  // row repeating what the field says.
  const wanted = draft.trim() === subject ? '' : draft
  const search = useIdentifierSearch(wanted)
  const suggestions = mergeSuggestions(search.suggestions, local, wanted)

  const commit = (next: string): void => {
    const value = next.trim()
    if (value === '') return
    setDraft(value)
    onQuery(value)
  }

  const typeahead = useTypeahead({
    count: suggestions.length,
    onActivate: (position) => {
      const chosen = suggestions[position]
      if (chosen !== undefined) commit(chosen.identifier)
    },
    onSubmit: () => {
      commit(draft)
    }
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    typeahead.onKeyDown(event)
    if (linked && isTypingKey(event)) onSever?.()
  }

  return (
    <div className={['ticker-field', className].filter(Boolean).join(' ')} ref={box}>
      {/*
        One rounded rectangle, not two: the surface owns the border and the
        radius, and opening the list grows it downwards. Same decision as the
        menu bar search (BU-53).
      */}
      <div className={`ticker-surface${typeahead.open || linksOpen ? ' ticker-surface-open' : ''}`}>
        <div className="ticker-row">
          {/*
            The way in and out of a link (BU-104). Linking was reachable only
            by opening a tab that was born linked, and severing only by
            typing — a gesture nothing on screen mentioned.
          */}
          {tabId !== undefined && (
            <button
              type="button"
              className={`ticker-link${linked ? ' ticker-link-on' : ''}`}
              aria-label={linked ? `Linked to ${source}` : 'Link this tab'}
              aria-expanded={linksOpen}
              aria-haspopup="menu"
              onClick={() => {
                setLinksOpen(!linksOpen)
              }}
            >
              <ChainIcon size={9} className={linked ? 'ticker-chain' : undefined} />
            </button>
          )}
          {tabId === undefined && linked && <ChainIcon size={9} className="ticker-chain" />}
          <input
            className="ticker-input"
            value={draft}
            aria-label={label ?? 'Subject'}
            role="combobox"
            aria-expanded={typeahead.open}
            aria-autocomplete="list"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value)
              typeahead.onInput()
            }}
            onKeyDown={handleKeyDown}
            onBlur={typeahead.close}
          />
        </div>

        {linksOpen && (
          <>
            <span className="ticker-rule" aria-hidden="true" />
            <div className="ticker-links" role="menu" aria-label="Link this tab">
              {linked && (
                <button
                  type="button"
                  role="menuitem"
                  className="popover-row ticker-link-row"
                  onClick={() => {
                    linkage.unlink()
                    setLinksOpen(false)
                  }}
                >
                  Unlink from {source}
                </button>
              )}

              {linkage.targets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  className="popover-row ticker-link-row"
                  onClick={() => {
                    linkage.link(target.id)
                    setLinksOpen(false)
                  }}
                >
                  <span>{target.title}</span>
                  <span className="popover-row-meta">{target.subject}</span>
                </button>
              ))}

              {linkage.targets.length === 0 && !linked && (
                <p className="ticker-link-empty type-11">No other tab has a subject to follow.</p>
              )}
            </div>
          </>
        )}

        {typeahead.open && (
          <>
            <span className="ticker-rule" aria-hidden="true" />
            <div className="ticker-suggestions" role="listbox" aria-label="Identifier suggestions">
              {suggestions.map((suggestion, position) => (
                <button
                  key={suggestion.identifier}
                  type="button"
                  role="option"
                  aria-selected={position === typeahead.active}
                  className={`popover-row ticker-suggestion${
                    position === typeahead.active ? ' ticker-suggestion-active' : ''
                  }${unavailableFor(suggestion, requires) ? ' ticker-suggestion-thin' : ''}`}
                  // Mouse down would blur the input and close the panel before
                  // the click ever landed.
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onMouseEnter={() => {
                    typeahead.setActive(position)
                  }}
                  onClick={() => {
                    if (linked) onSever?.()
                    commit(suggestion.identifier)
                  }}
                >
                  <span className="ticker-suggestion-id">{suggestion.identifier}</span>
                  <span className="popover-row-meta">
                    {unavailableFor(suggestion, requires)
                      ? `no ${String(requires)} data`
                      : (suggestion.name ?? '')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
