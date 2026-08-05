import { useCallback, useState } from 'react'
import type { KeyboardEvent } from 'react'

/**
 * The keyboard model behind an open-on-type list (BU-68).
 *
 * Extracted from the menu bar's search when the query bar needed the same
 * behaviour. What is shared is this — open on the first character, ↑/↓ move a
 * highlight that is NOT hover, Enter takes the highlighted row or falls
 * through to a plain submit, Escape dismisses without clearing the text.
 * What is not shared is the rendering: one list is grouped tabs and actions,
 * the other is tickers.
 *
 * Dismissal is separate from emptiness so Escape can hide a list that still
 * has rows in it, and typing another character brings it back.
 */
export interface TypeaheadOptions {
  /** How many rows are on offer right now. */
  count: number
  onActivate: (index: number) => void
  /** Enter with nothing highlighted. */
  onSubmit?: () => void
}

export interface Typeahead {
  /** Highlighted row, or -1 for none. */
  active: number
  open: boolean
  setActive: (index: number) => void
  /** Call from onChange: a new character un-dismisses and drops the highlight. */
  onInput: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  close: () => void
}

/** Wraps at both ends, and -1 is a real position — "nothing highlighted". */
export function nextIndex(current: number, step: number, count: number): number {
  if (count === 0) return -1
  const next = current + step
  if (next < 0) return count - 1
  if (next >= count) return 0
  return next
}

export function useTypeahead({ count, onActivate, onSubmit }: TypeaheadOptions): Typeahead {
  const [active, setActive] = useState(-1)
  const [dismissed, setDismissed] = useState(false)

  const open = count > 0 && !dismissed

  const close = useCallback((): void => {
    setDismissed(true)
    setActive(-1)
  }, [])

  const onInput = useCallback((): void => {
    setDismissed(false)
    setActive(-1)
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      // Stop, or the pane behind may also take it as a dismissal.
      event.stopPropagation()
      close()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) return
      event.preventDefault()
      setActive((current) => nextIndex(current, event.key === 'ArrowDown' ? 1 : -1, count))
      return
    }

    if (event.key !== 'Enter') return

    // With nothing highlighted, Enter is still a plain submit — a ticker the
    // index has never heard of has to keep working.
    if (open && active >= 0 && active < count) {
      event.preventDefault()
      onActivate(active)
      setActive(-1)
      return
    }
    onSubmit?.()
  }

  return { active, open, setActive, onInput, onKeyDown, close }
}
