import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'

/**
 * As many of a run of columns as the room takes, oldest first and opening on
 * the newest, with Earlier and Later to step back and forward a page, as the
 * Overview's Performance table pages (Karan, 2026-11-27).
 */
export function usePages<T>(
  items: readonly T[],
  room: number,
  /** The page's span in words, as "29 Aug 2025 to 26 Dec 2025". */
  rangeOf: (shown: readonly T[]) => string
): { shown: T[]; pager: ReactElement | null; reset: () => void } {
  // How many columns back from the newest the page ends.
  const [back, setBack] = useState(0)
  const fits = Math.max(1, room)
  const behind = Math.min(back, Math.max(0, items.length - fits))
  const end = items.length - behind
  const shown = items.slice(Math.max(0, end - fits), end)
  const pager =
    items.length > fits ? (
      <>
        <Button
          disabled={end <= fits}
          onClick={() => {
            setBack(behind + fits)
          }}
        >
          Earlier
        </Button>
        <span className="performance-range type-11">{rangeOf(shown)}</span>
        <Button
          disabled={behind === 0}
          onClick={() => {
            setBack(Math.max(0, behind - fits))
          }}
        >
          Later
        </Button>
      </>
    ) : null
  return {
    shown,
    pager,
    reset: () => {
      setBack(0)
    }
  }
}

/** A page's span from its first and last dates in words; one date when they are the same. */
export function spanOf(first: string | undefined, last: string | undefined): string {
  return first === last ? (first ?? '') : `${first ?? ''} to ${last ?? ''}`
}
