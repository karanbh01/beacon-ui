import { useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../../components/Table/HeaderTip.css'

/**
 * A figure's words on hover, in the frosted glass the column tips use, so a
 * small chart can carry no text of its own (Karan, 2026-11-19).
 */
export function HoverTip({
  tip,
  children,
  className
}: {
  tip: ReactNode
  children: ReactNode
  className?: string
}): ReactElement {
  const anchor = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  const show = (): void => {
    const box = anchor.current?.getBoundingClientRect()
    if (box === undefined) return
    setAt({ left: Math.min(box.left, window.innerWidth - 300), top: box.bottom + 6 })
  }
  const hide = (): void => {
    setAt(null)
  }

  return (
    <div
      ref={anchor}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
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
    </div>
  )
}
