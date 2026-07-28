import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import './TickerField.css'

export interface TickerFieldProps {
  /** The subject on screen now, e.g. "AAPL". */
  subject: string
  /**
   * When set, this field follows another tab's subject. The chain shows and
   * typing severs the link (taxonomy 2).
   */
  linkedTo?: string
  /** Enter pressed on an edited value. */
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
  const inputRef = useRef<HTMLInputElement>(null)

  // A linked field mirrors its source, so an upstream change must show here
  // even while this input is mounted and untouched.
  useEffect(() => {
    setDraft(subject)
  }, [subject])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      const next = draft.trim()
      if (next !== '') onQuery(next)
      return
    }
    if (linked && isTypingKey(event)) {
      onSever?.()
    }
  }

  const hint = linked ? `linked to ${linkedTo} · type to break ⏎` : '⏎ query'

  return (
    <div className={['ticker-field', className].filter(Boolean).join(' ')}>
      {linked && <ChainIcon size={9} className="ticker-chain" />}
      <input
        ref={inputRef}
        className="ticker-input"
        value={draft}
        aria-label={label ?? 'Subject'}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="ticker-hint">{hint}</span>
    </div>
  )
}
