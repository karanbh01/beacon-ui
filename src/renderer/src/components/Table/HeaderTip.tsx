import { useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './HeaderTip.css'

interface HeaderTipProps {
  /** The column name, which is what the reader points at. */
  children: ReactNode
  /** What the column is, shown on hover. */
  tip: ReactNode
}

/**
 * More about a column, on hover over its name (Karan, 2026-10-19): which
 * rule or screen it is and what it does. Drawn in the app's frosted popover
 * glass, into the body, since a table's head clips what overflows it.
 */
export function HeaderTip({ children, tip }: HeaderTipProps): ReactElement {
  const anchor = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  const show = (): void => {
    const box = anchor.current?.getBoundingClientRect()
    if (box === undefined) return
    // Under the name, kept on screen at the right edge.
    setAt({ left: Math.min(box.left, window.innerWidth - 300), top: box.bottom + 6 })
  }

  return (
    <span
      ref={anchor}
      className="header-tip-anchor"
      onMouseEnter={show}
      onMouseLeave={() => {
        setAt(null)
      }}
      onFocus={show}
      onBlur={() => {
        setAt(null)
      }}
      tabIndex={0}
    >
      {children}
      {at !== null &&
        createPortal(
          <div className="header-tip" role="tooltip" style={{ left: at.left, top: at.top }}>
            {tip}
          </div>,
          document.body
        )}
    </span>
  )
}
