import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactElement, ReactNode } from 'react'
import { carriesTab, dropIndexAt, dropMarkerX, TAB_MIME } from './dragTab'
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
  /** A tab was dropped on this strip at `index`. Omit to refuse drops. */
  onDropTab?: (id: string, index: number) => void
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
 *
 * Since BU-55 the strip is also a drop target, so a tab can be dragged from
 * one pane to another.
 */
export function TabBar({
  children,
  onNewTab,
  newTabMenu,
  activeIndex,
  onDropTab,
  className
}: TabBarProps): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null)
  /** Strip-local x of the drop marker, or absent when no drag is over us. */
  const [markerX, setMarkerX] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (activeIndex === undefined) return
    const strip = stripRef.current
    const tab = strip?.children[activeIndex]
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeIndex])

  /** Tab elements only — the marker is a child of the strip too. */
  const tabRects = (): DOMRect[] =>
    [...(stripRef.current?.querySelectorAll('.tab') ?? [])].map((node) =>
      node.getBoundingClientRect()
    )

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (onDropTab === undefined || !carriesTab([...event.dataTransfer.types])) return
    // Without this the browser refuses the drop and falls back to its default
    // handling, which for a drag it does not recognise is to do nothing.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const rects = tabRects()
    const strip = stripRef.current
    const x = dropMarkerX(rects, dropIndexAt(rects, event.clientX))
    // The marker is positioned inside the strip, which scrolls, so the
    // viewport x has to be put back into content coordinates.
    setMarkerX(x - (strip?.getBoundingClientRect().left ?? 0) + (strip?.scrollLeft ?? 0))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    const id = event.dataTransfer.getData(TAB_MIME)
    setMarkerX(undefined)
    if (onDropTab === undefined || id === '') return
    event.preventDefault()
    onDropTab(id, dropIndexAt(tabRects(), event.clientX))
  }

  return (
    <div
      className={['tab-bar', className].filter(Boolean).join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={() => {
        setMarkerX(undefined)
      }}
      onDrop={handleDrop}
    >
      <div className="tab-bar-strip" ref={stripRef} role="tablist">
        {children}
        {/*
         * Positioned rather than laid out, so the tabs do not shuffle under
         * the cursor while the marker moves between them.
         */}
        {markerX !== undefined && (
          <span className="tab-bar-drop" style={{ left: markerX }} aria-hidden="true" />
        )}
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
