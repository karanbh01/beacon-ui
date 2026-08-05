import { useEffect, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import { useIdentifierIndex } from '../../views/shared/identifierIndex'
import { useTypeahead } from '../Typeahead/useTypeahead'
import { matchSuggestions } from './suggestions'
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
  label,
  className
}: TickerFieldProps): ReactElement {
  const linked = linkedTo !== undefined
  const [draft, setDraft] = useState(subject)
  const index = useIdentifierIndex()

  // A linked field mirrors its source, so an upstream change must show here
  // even while this input is mounted and untouched.
  useEffect(() => {
    setDraft(subject)
  }, [subject])

  // Never suggest the thing already on screen — the whole list would be one
  // row repeating what the field says.
  const suggestions = draft.trim() === subject ? [] : matchSuggestions(draft, index)

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

  const hint = linked ? `linked to ${linkedTo} · type to break ⏎` : '⏎ query'

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
          <span className="ticker-hint">{hint}</span>
        </div>

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
                  }`}
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
                  <span className="popover-row-meta">{suggestion.name ?? ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
