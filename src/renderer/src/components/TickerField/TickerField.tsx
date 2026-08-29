import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import { useIdentifierIndex } from '../../views/shared/identifierIndex'
import { useIdentifierSearch } from '../../views/shared/useIdentifierSearch'
import { useTypeahead } from '../Typeahead/useTypeahead'
import { mergeSuggestions, unavailableFor } from './suggestions'
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
  className
}: TickerFieldProps): ReactElement {
  const [draft, setDraft] = useState(subject)
  const local = useIdentifierIndex()
  /*
   * The STORE decides whether this tab follows another, not the caller.
   *
   * `linkedTo` is passed by two views out of six, so a Reference Data tab
   * could be genuinely linked — chain on the tab strip, subject inherited —
   * while its own field showed "Link this tab". Two sources of truth for one
   * fact, and the wrong one was nearer the control.
   */
  const linked = linkedTo !== undefined

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

  /*
   * Tab finishes the highlighted suggestion; Enter commits it (BU-126).
   *
   * The two are separate on purpose, as they are in the menu bar's search:
   * completing lets you see what you are about to ask for before asking for
   * it, and on a linked tab committing is what breaks the link.
   *
   * The highlight survives the completion, so Enter straight after takes the
   * row that was completed rather than falling through to the raw draft
   * (BU-125).
   */
  /*
   * Follow the highlight (BU-126).
   *
   * The list holds more rows than the panel is tall, and a highlight that
   * walks off the bottom is one the keyboard appears to have lost.
   */
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeahead.active < 0) return
    const rows = list.current?.querySelectorAll<HTMLElement>('[role="option"]')
    rows?.[typeahead.active]?.scrollIntoView({ block: 'nearest' })
  }, [typeahead.active])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const filling = suggestions[typeahead.active] ?? suggestions[0]
    if (event.key === 'Tab' && !event.shiftKey && typeahead.open && filling !== undefined) {
      if (filling.identifier !== draft) {
        event.preventDefault()
        setDraft(filling.identifier)
        typeahead.setActive(suggestions.indexOf(filling))
        if (linked) onSever?.()
        return
      }
    }

    typeahead.onKeyDown(event)
    if (linked && isTypingKey(event)) onSever?.()
  }

  return (
    <div className={['ticker-field', className].filter(Boolean).join(' ')}>
      {/*
        One rounded rectangle, not two: the surface owns the border and the
        radius, and opening the list grows it downwards. Same decision as the
        menu bar search (BU-53).
      */}
      <div className={`ticker-surface${typeahead.open ? ' ticker-surface-open' : ''}`}>
        <div className="ticker-row">
          {linked && <ChainIcon size={9} className="ticker-chain" />}
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

        {typeahead.open && (
          <>
            <span className="ticker-rule" aria-hidden="true" />
            <div
              className="ticker-suggestions"
              role="listbox"
              aria-label="Identifier suggestions"
              ref={list}
            >
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
