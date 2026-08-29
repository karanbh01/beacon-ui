import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { nextEnabled, type Menu, type MenuAction, type MenuItem } from './menuModel'
import './MenuDropdown.css'

export interface MenuDropdownProps {
  menu: Menu
  open: boolean
  onClose: () => void
  onActivate: (action: MenuAction) => void
}

interface RowProps {
  item: MenuItem
  highlighted: boolean
  onHighlight: () => void
  onChoose: () => void
}

/**
 * One row, in the panel or in a flyout — they are the same thing.
 *
 * A submenu parent gets a chevron instead of a hint and never dispatches its
 * own action: choosing it means opening the flyout.
 */
function Row({ item, highlighted, onHighlight, onChoose }: RowProps): ReactElement {
  const submenu = item.submenu !== undefined

  return (
    <div className="menu-dropdown-slot">
      {item.separatorBefore === true && <span className="menu-dropdown-rule" aria-hidden="true" />}
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!item.enabled}
        // Disabled items still announce, so the menu reads as a whole rather
        // than as a list with holes in it.
        aria-disabled={!item.enabled}
        {...(submenu ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': highlighted } : {})}
        {...(item.checked === undefined
          ? {}
          : { 'aria-checked': item.checked, role: 'menuitemradio' })}
        tabIndex={highlighted ? 0 : -1}
        onMouseEnter={onHighlight}
        onClick={onChoose}
      >
        <span className="menu-dropdown-tick" aria-hidden="true">
          {item.checked === true ? '✓' : ''}
        </span>
        <span className="menu-dropdown-label">{item.label}</span>
        {item.hint !== undefined && <span className="menu-dropdown-hint">{item.hint}</span>}
        {submenu && (
          <span className="menu-dropdown-more" aria-hidden="true">
            ›
          </span>
        )}
      </button>
    </div>
  )
}

/**
 * One menu-bar dropdown (BU-76), with flyouts for grouped items (BU-121).
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
  /** Index of the item whose flyout is open, and the row highlighted inside it. */
  const [flyout, setFlyout] = useState(-1)
  const [inner, setInner] = useState(-1)
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
      setFlyout(-1)
      setInner(-1)
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

  const items = menu.items
  const opened = flyout >= 0 ? items[flyout]?.submenu : undefined

  /** Highlight an item, and open or close the flyout to match. */
  const highlight = (index: number): void => {
    setActive(index)
    setInner(-1)
    setFlyout(items[index]?.submenu === undefined ? -1 : index)
  }

  const choose = (item: MenuItem, index: number): void => {
    if (!item.enabled) return
    if (item.submenu !== undefined) {
      highlight(index)
      return
    }
    onActivate(item.action)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Inside an open flyout the arrows belong to it, not to the panel.
    if (opened !== undefined && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setInner((current) => nextEnabled(opened, current, event.key === 'ArrowDown' ? 1 : -1))
      return
    }

    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      setActive((current) => {
        const next = nextEnabled(items, current, step)
        setFlyout(items[next]?.submenu === undefined ? -1 : next)
        setInner(-1)
        return next
      })
      return
    }

    const child = items[active]?.submenu
    if (event.key === 'ArrowRight' && child !== undefined) {
      event.preventDefault()
      setFlyout(active)
      setInner(nextEnabled(child, -1, 1))
      return
    }

    if (event.key === 'ArrowLeft' && opened !== undefined) {
      event.preventDefault()
      setFlyout(-1)
      setInner(-1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const chosen = opened?.[inner]
      if (chosen === undefined) return
      event.preventDefault()
      onActivate(chosen.action)
      onClose()
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(nextEnabled(items, event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1))
      return
    }

    if (event.key === 'Escape') {
      event.stopPropagation()
      // A flyout closes first: Escape means "back", not "give up", while
      // there is somewhere to go back to.
      if (opened !== undefined) {
        setFlyout(-1)
        setInner(-1)
        return
      }
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
      {items.map((item, index) => (
        <Row
          key={item.label}
          item={item}
          highlighted={index === active}
          onHighlight={() => {
            if (item.enabled) highlight(index)
          }}
          onChoose={() => {
            choose(item, index)
          }}
        />
      ))}

      {/*
        Attached, not adjacent (BU-121).

        The flyout's left edge sits ON the panel's right border — one shared
        hairline — so the two read as one shape rather than as a second box
        that happens to be nearby. It also means the pointer never crosses a
        gap on its way over, which is what makes hover-opened submenus
        infuriating when they are merely close.
      */}
      {opened !== undefined && (
        <div
          className="dropdown-surface menu-dropdown menu-dropdown-flyout"
          role="menu"
          aria-label={items[flyout]?.label ?? menu.label}
          style={{ top: `${String(flyout * 26)}px` }}
        >
          {opened.map((item, index) => (
            <Row
              key={item.label}
              item={item}
              highlighted={index === inner}
              onHighlight={() => {
                if (item.enabled) setInner(index)
              }}
              onChoose={() => {
                if (!item.enabled) return
                onActivate(item.action)
                onClose()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
