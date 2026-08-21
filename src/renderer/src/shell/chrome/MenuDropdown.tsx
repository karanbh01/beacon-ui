import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { nextEnabled, type Menu, type MenuAction } from './menuModel'
import './MenuDropdown.css'

export interface MenuDropdownProps {
  menu: Menu
  open: boolean
  onClose: () => void
  onActivate: (action: MenuAction) => void
}

/**
 * One menu-bar dropdown (BU-76).
 *
 * Not the `Popover` primitive, despite the family resemblance. Popover is a
 * `role="dialog"` with its own outside-click and Escape handling, and a menu
 * is a `role="menu"` whose keyboard model is different in kind — arrows move
 * a roving highlight, Home/End jump, and the whole bar behaves as one
 * component while any of it is open. Wrapping a dialog to get that would mean
 * fighting its focus handling rather than reusing it. What IS shared is the
 * surface, which lives in tokens/surface.css and is consumed by both.
 *
 * Dismissal is owned by the bar rather than by each menu, because hovering
 * from one open menu to a sibling has to switch rather than close-and-open.
 */
export function MenuDropdown({
  menu,
  open,
  onClose,
  onActivate
}: MenuDropdownProps): ReactElement | null {
  const [active, setActive] = useState(-1)
  const list = useRef<HTMLDivElement>(null)

  /*
   * A menu opens with nothing highlighted, and focus moves INTO it.
   *
   * Without the focus move the trigger keeps it, arrow keys go to the button
   * rather than to this handler, and the menu is mouse-only — which is what
   * happened first time round. Focus lands on the container rather than the
   * first item so nothing is pre-selected, matching how a menu bar behaves
   * everywhere else.
   */
  useEffect(() => {
    if (!open) {
      setActive(-1)
      return
    }
    list.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || active < 0) return
    // Both roles: a checkable item is a `menuitemradio`, so querying only
    // for `menuitem` would silently skip every item in the View menu.
    const items = list.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]'
    )
    items?.[active]?.focus()
  }, [open, active])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      setActive((current) => nextEnabled(menu.items, current, step))
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(
        nextEnabled(menu.items, event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1)
      )
      return
    }

    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      ref={list}
      className="dropdown-surface menu-dropdown"
      role="menu"
      aria-label={menu.label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {menu.items.map((item, index) => (
        <div key={item.label} className="menu-dropdown-slot">
          {item.separatorBefore === true && (
            <span className="menu-dropdown-rule" aria-hidden="true" />
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-dropdown-item"
            disabled={!item.enabled}
            // Disabled items still announce, so the menu reads as a whole
            // rather than as a list with holes in it.
            aria-disabled={!item.enabled}
            {...(item.checked === undefined
              ? {}
              : { 'aria-checked': item.checked, role: 'menuitemradio' })}
            tabIndex={index === active ? 0 : -1}
            onMouseEnter={() => {
              if (item.enabled) setActive(index)
            }}
            onClick={() => {
              if (!item.enabled) return
              onActivate(item.action)
              onClose()
            }}
          >
            <span className="menu-dropdown-tick" aria-hidden="true">
              {item.checked === true ? '✓' : ''}
            </span>
            <span className="menu-dropdown-label">{item.label}</span>
            {item.hint !== undefined && <span className="menu-dropdown-hint">{item.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}
