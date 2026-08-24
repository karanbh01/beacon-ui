import { useEffect, useRef, type ReactElement } from 'react'
import { useLinkTargets } from '../components/TickerField/useLinkTargets'
import './TabLinkMenu.css'

export interface TabLinkMenuProps {
  tabId: string
  /** Pane-relative, measured from the chip that opened it. */
  left: number
  top: number
  onClose: () => void
}

/**
 * Link and unlink, hung off the tab's chip (BU-108).
 *
 * It lived in the subject field first. Wrong place: the chip is what SAYS a
 * tab is bound to something and what carries the chain, so it is where that
 * binding should be changed. The field is for typing.
 *
 * Glass, like the menu-bar search — the chrome's popovers are glass and this
 * hangs off the tab strip, which is chrome.
 */
export function TabLinkMenu({ tabId, left, top, onClose }: TabLinkMenuProps): ReactElement {
  const linkage = useLinkTargets(tabId)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Element
      if (box.current?.contains(target) === true) return
      // The chip toggles itself, so a click there must not also close here:
      // it would close and reopen in one gesture and look like nothing moved.
      if (target.closest('.tab-chip-button') !== null) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="tab-link-menu"
      role="menu"
      aria-label="Link this tab"
      style={{ left, top }}
      ref={box}
    >
      {linkage.unlinkLabel !== undefined && (
        <button
          type="button"
          role="menuitem"
          className="popover-row tab-link-row"
          onClick={() => {
            linkage.unlink()
            onClose()
          }}
        >
          {linkage.unlinkLabel}
        </button>
      )}

      {linkage.targets.map((target) => (
        <button
          key={target.id}
          type="button"
          role="menuitem"
          className="popover-row tab-link-row"
          onClick={() => {
            linkage.link(target.id)
            onClose()
          }}
        >
          <span>{target.title}</span>
          <span className="popover-row-meta">{target.subject}</span>
        </button>
      ))}

      {linkage.targets.length === 0 && !linkage.inLink && (
        <p className="tab-link-empty type-11">No other tab has a subject to follow.</p>
      )}
    </div>
  )
}
