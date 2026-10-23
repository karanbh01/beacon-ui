import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useCurrentPane } from '../../state/currentPane'
import { here } from '../tabActions'
import { seekTargets, takesTyping, type SeekTarget } from './seekTargets'

/** Marks a found control: `match` for each, `current` for the one Enter takes. */
const MARK = 'data-seek'

export interface SeekMode {
  seeking: boolean
  text: string
  /** How many controls the text found, for the field to say. */
  found: number
  start: () => void
  stop: () => void
  setText: (text: string) => void
  /** The field's keys while seeking; true when it used the key. */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean
}

/**
 * Seek mode (BU-285, Karan): Alt in the search bar turns it into a way of
 * pressing what is in the current window. What is typed picks out the
 * controls whose names hold it; ↑/↓ or Tab step between them; Enter presses
 * the chosen one, or puts the caret in it when it is a field. Escape or Alt
 * again goes back to searching.
 */
export function useSeekMode(page: string, field: () => HTMLInputElement | null): SeekMode {
  const [seeking, setSeeking] = useState(false)
  const [text, setText] = useState('')
  const [index, setIndex] = useState(0)
  const [targets, setTargets] = useState<SeekTarget[]>([])
  const marked = useRef<HTMLElement[]>([])

  // Find again as the text changes; a new text starts at its best fit.
  useEffect(() => {
    if (!seeking) return
    const root = currentWindow(page)
    setTargets(root === null ? [] : seekTargets(root, text))
    setIndex(0)
  }, [seeking, text, page])

  // Paint the marks, and take them all off before painting again.
  useEffect(() => {
    unmark(marked.current)
    marked.current = []
    if (!seeking) return
    targets.forEach((target, at) => {
      target.element.setAttribute(MARK, at === index ? 'current' : 'match')
      marked.current.push(target.element)
    })
    targets[index]?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [seeking, targets, index])

  useEffect(
    () => () => {
      unmark(marked.current)
    },
    []
  )

  const stop = (): void => {
    setSeeking(false)
    setText('')
    setTargets([])
  }

  const start = (): void => {
    setSeeking(true)
    setText('')
    // Show which window is being steered, as moving to it would.
    const at = here(page)
    if (at !== undefined) useCurrentPane.getState().choose(page, at.pane, true)
  }

  /*
   * A button is pressed and the caret stays in the search bar, so Alt goes
   * straight back to seeking (Karan). A field takes the caret instead: it
   * was chosen to be typed in.
   */
  const press = (): void => {
    const target = targets[index]?.element
    stop()
    if (target === undefined) return
    if (takesTyping(target)) {
      field()?.blur()
      target.focus()
      return
    }
    target.click()
    field()?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    const step =
      event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)
        ? 1
        : event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)
          ? -1
          : 0
    if (step !== 0) {
      if (targets.length > 0) setIndex((at) => (at + step + targets.length) % targets.length)
      return true
    }
    if (event.key === 'Enter') {
      press()
      return true
    }
    if (event.key === 'Escape') {
      stop()
      return true
    }
    return false
  }

  return { seeking, text, found: targets.length, start, stop, setText, onKeyDown }
}

/** The body of the page's current window, where seeking looks. */
function currentWindow(page: string): Element | null {
  const at = here(page)
  if (at === undefined) return null
  return document.querySelector(`.pane-host [data-pane="${String(at.pane)}"] .pane-body`)
}

function unmark(elements: readonly HTMLElement[]): void {
  for (const element of elements) element.removeAttribute(MARK)
}
