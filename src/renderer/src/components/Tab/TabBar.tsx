import { useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import './TabBar.css'

export interface TabBarProps {
  children: ReactNode
  /** Omit to hide the new-tab affordance, e.g. on a fixed global page. */
  onNewTab?: () => void
  /** Rendered beside the `+` so its popover anchors to the button (BU-56). */
  newTabMenu?: ReactNode
  /**
   * Index of the active tab. Used only to scroll it into view; the tabs
   * themselves own their active styling.
   */
  activeIndex?: number
  className?: string
}

/**
 * Overflow is horizontal scroll, decided in BU-11.
 *
 * The alternative was collapsing the remainder into a menu. Scroll won
 * because the chip grammar is the point of this bar: a tab has to show its
 * subject, chain and dirty dot to be readable at all (taxonomy 2), and both
 * collapsing and shrinking hide exactly that. A scrolled-off tab is
 * temporarily invisible; a truncated one is permanently ambiguous.
 *
 * The cost is that hidden tabs give no count. Mitigated by scrolling the
 * active tab into view whenever it changes, so keyboard and programmatic
 * navigation never strand the user looking at the wrong part of the strip.
 */
export function TabBar({
  children,
  onNewTab,
  newTabMenu,
  activeIndex,
  className
}: TabBarProps): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeIndex === undefined) return
    const strip = stripRef.current
    const tab = strip?.children[activeIndex]
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeIndex])

  return (
    <div className={['tab-bar', className].filter(Boolean).join(' ')}>
      <div className="tab-bar-strip" ref={stripRef} role="tablist">
        {children}
      </div>
      {onNewTab !== undefined && (
        <span className="tab-bar-anchor">
          <button
            type="button"
            className="tab-bar-new"
            onClick={onNewTab}
            aria-label="New tab"
            aria-haspopup="menu"
          >
            +
          </button>
          {newTabMenu}
        </span>
      )}
    </div>
  )
}
