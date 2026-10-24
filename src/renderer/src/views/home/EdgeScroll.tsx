import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import './EdgeScroll.css'

export interface EdgeScrollProps {
  children: ReactNode
  /** What counts as a row, for the depth effect. */
  rows: string
  /**
   * Scale each child of a row about its own anchor (set in the stylesheet)
   * rather than the row whole: for rows laid out in columns, where scaling
   * the whole row would pull its right-hand column inward.
   */
  byParts?: boolean
  /** Where in a row its text size is read, when not on the row itself. */
  text?: string
}

/** How far into the list an edge's shrinking reaches, in pixels. */
const DEPTH_ZONE = 36

/**
 * At the edge itself, how much smaller a row's text has become: 1px, after
 * 3px and then 1.5px read too strong (Karan).
 */
const DEPTH_SHRINK_PX = 1

/**
 * A Home list that scrolls within the room it is given (Karan): no scrollbar
 * drawn, as Home has none; an edge with more beyond it blurs softly into the
 * ground; and rows draw back a little as they slide under it, so the list
 * reads as curving away. Recent Activity and the Changelog both use it.
 */
export function EdgeScroll({
  children,
  rows,
  byParts = false,
  text
}: EdgeScrollProps): ReactElement {
  const scroller = useRef<HTMLDivElement>(null)
  const more = useMoreBeyond(scroller)
  useEdgeDepth(scroller, rows, byParts, text)

  return (
    <div className="edge-scroll" data-more-above={more.above} data-more-below={more.below}>
      <div className="edge-scroller" ref={scroller} onScroll={more.update}>
        {children}
      </div>
      <span className="edge-scroll-edge edge-scroll-top" aria-hidden="true" />
      <span className="edge-scroll-edge edge-scroll-bottom" aria-hidden="true" />
    </div>
  )
}

function beyond(box: HTMLElement): { above: boolean; below: boolean } {
  return {
    above: box.scrollTop > 0,
    below: box.scrollTop + box.clientHeight < box.scrollHeight - 1
  }
}

/** Whether the list runs on above and below what shows, kept as it scrolls or resizes. */
function useMoreBeyond(scroller: { current: HTMLDivElement | null }): {
  above: boolean
  below: boolean
  update: () => void
} {
  const [edges, setEdges] = useState({ above: false, below: false })
  const update = (): void => {
    const box = scroller.current
    if (box === null) return
    const next = beyond(box)
    setEdges((now) => (now.above === next.above && now.below === next.below ? now : next))
  }

  useEffect(() => {
    const box = scroller.current
    if (box === null) return undefined
    const look = (): void => {
      const next = beyond(box)
      setEdges((now) => (now.above === next.above && now.below === next.below ? now : next))
    }
    // The list inside changes height too: a release opened to its notes.
    const watcher = new ResizeObserver(look)
    watcher.observe(box)
    if (box.firstElementChild !== null) watcher.observe(box.firstElementChild)
    look()
    return () => {
      watcher.disconnect()
    }
  }, [scroller])

  return { ...edges, update }
}

/**
 * Rows draw back as they slide under a blurred edge: each scales down until
 * its text is DEPTH_SHRINK_PX smaller at the very edge. Only an edge with
 * more beyond it does this, as only that edge is blurred.
 */
function useEdgeDepth(
  scroller: { current: HTMLDivElement | null },
  rows: string,
  byParts: boolean,
  text: string | undefined
): void {
  useEffect(() => {
    const box = scroller.current
    if (box === null) return undefined
    const sizes = new WeakMap<Element, number>()
    const sizeOf = (row: Element): number => {
      const known = sizes.get(row)
      if (known !== undefined) return known
      const words = (text === undefined ? null : row.querySelector(text)) ?? row
      const size = parseFloat(getComputedStyle(words).fontSize) || 13
      sizes.set(row, size)
      return size
    }

    let frame = 0
    const apply = (): void => {
      const room = box.getBoundingClientRect()
      const { above, below } = beyond(box)
      for (const row of box.querySelectorAll<HTMLElement>(rows)) {
        const place = row.getBoundingClientRect()
        const middle = place.top + place.height / 2
        const fromTop = above ? middle - room.top : Infinity
        const fromBottom = below ? room.bottom - middle : Infinity
        const into = Math.min(
          Math.max((DEPTH_ZONE - Math.min(fromTop, fromBottom)) / DEPTH_ZONE, 0),
          1
        )
        const scale =
          into === 0 ? '' : `scale(${String(1 - (into * DEPTH_SHRINK_PX) / sizeOf(row))})`
        if (!byParts) {
          row.style.transform = scale
          continue
        }
        for (const part of row.children)
          if (part instanceof HTMLElement) part.style.transform = scale
      }
    }
    const soon = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    box.addEventListener('scroll', soon, { passive: true })
    // Opening a release changes where every row below it sits.
    box.addEventListener('toggle', soon, true)
    const watcher = new ResizeObserver(soon)
    watcher.observe(box)
    if (box.firstElementChild !== null) watcher.observe(box.firstElementChild)
    apply()
    return () => {
      box.removeEventListener('scroll', soon)
      box.removeEventListener('toggle', soon, true)
      watcher.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [scroller, rows, byParts, text])
}
