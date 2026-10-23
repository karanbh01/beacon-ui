import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { useFind } from '../../state/find'
import { clearPaint, findRanges, paint, reveal } from './findMatches'
import './FindBar.css'

/**
 * Ctrl+F (BU-283): finds text across the open windows, as a browser's find
 * bar does a page. Enter and Shift+Enter step through the matches, Escape
 * closes it. The windows can change under it, so it looks again when they do.
 */
export function FindBar(): ReactElement | null {
  const open = useFind((state) => state.open)
  if (!open) return null
  return <FindPanel />
}

function FindPanel(): ReactElement {
  const query = useFind((state) => state.query)
  const asked = useFind((state) => state.asked)
  const setQuery = useFind((state) => state.setQuery)
  const hide = useFind((state) => state.hide)
  const input = useRef<HTMLInputElement>(null)
  const [ranges, setRanges] = useState<Range[]>([])
  const [current, setCurrent] = useState(0)

  // Each Ctrl+F lands in the field with its text selected, ready to replace.
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [asked])

  // Look again as the query changes, and as the windows change under it.
  useEffect(() => {
    const look = (): void => {
      setRanges(findRanges(query))
    }
    // A new query goes to its first match, as typing in a browser's does;
    // a look after the windows changed stays where the reader is.
    const first = findRanges(query)
    setRanges(first)
    reveal(first[0])
    const host = document.querySelector('.pane-host')
    if (host === null) return undefined
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(look)
    })
    observer.observe(host, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [query])

  // A fresh query starts at its first match.
  useEffect(() => {
    setCurrent(0)
  }, [query])

  useEffect(() => {
    paint(ranges, Math.min(current, ranges.length - 1))
  }, [ranges, current])

  useEffect(() => clearPaint, [])

  const step = (by: 1 | -1): void => {
    if (ranges.length === 0) return
    const next = (((current + by) % ranges.length) + ranges.length) % ranges.length
    setCurrent(next)
    reveal(ranges[next])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      hide()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
  }

  const count =
    query.trim() === ''
      ? ''
      : ranges.length === 0
        ? 'No matches'
        : `${String(Math.min(current, ranges.length - 1) + 1)} of ${String(ranges.length)}`

  return (
    <div className="find-bar dropdown-surface" role="search" aria-label="Find in windows">
      <input
        ref={input}
        className="find-bar-input"
        aria-label="Find in windows"
        placeholder="Find in windows"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      <span className="find-bar-count type-11" aria-live="polite">
        {count}
      </span>
      <button
        type="button"
        className="find-bar-button find-bar-previous"
        aria-label="Previous match"
        disabled={ranges.length === 0}
        onClick={() => {
          step(-1)
        }}
      >
        <ChevronIcon size={16} />
      </button>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Next match"
        disabled={ranges.length === 0}
        onClick={() => {
          step(1)
        }}
      >
        <ChevronIcon size={16} />
      </button>
      <button type="button" className="find-bar-button" aria-label="Close find" onClick={hide}>
        &times;
      </button>
    </div>
  )
}
