import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Popover } from './chrome/Popover'
import { nextIndex } from './chrome/searchResults'
import type { NewTabOption } from './newTabOptions'
import './NewTabMenu.css'

export interface NewTabMenuProps {
  open: boolean
  onClose: () => void
  options: readonly NewTabOption[]
  onChoose: (option: NewTabOption) => void
}

/**
 * What the `+` opens (Figma 122:4 for the button; BU-56 for this).
 *
 * The same glass surface as the search dropdown, layout menu and data sources
 * panel — `Popover` already is that surface and already owns Escape,
 * outside-click and don't-close-on-inside-click, so this borrows all four
 * rather than growing a fourth copy of them.
 */
export function NewTabMenu({ open, onClose, options, onChoose }: NewTabMenuProps): ReactElement {
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  // Reopening should not resume where the last visit left off.
  useEffect(() => {
    if (open) setActive(0)
  }, [open])

  const choosable = options.filter((option) => option.unavailable === undefined)

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setActive((current) => nextIndex(current, event.key === 'ArrowDown' ? 1 : -1, choosable.length))
  }

  return (
    <Popover open={open} onClose={onClose} label="New tab" align="start" className="new-tab-menu">
      <p className="popover-heading">NEW TAB</p>
      <div ref={list} role="menu" onKeyDown={onKeyDown}>
        {options.map((option) => {
          const index = choosable.indexOf(option)
          return (
            <button
              key={option.viewKind}
              type="button"
              role="menuitem"
              // Present but not choosable, so the menu's shape stays learnable
              // as things get opened rather than growing under the cursor.
              disabled={option.unavailable !== undefined}
              className={`popover-row new-tab-row${index === active ? ' new-tab-row-active' : ''}`}
              onMouseEnter={() => {
                if (index >= 0) setActive(index)
              }}
              onClick={() => {
                onChoose(option)
                onClose()
              }}
            >
              <span>{option.title}</span>
              {option.unavailable !== undefined && (
                <span className="popover-row-meta">{option.unavailable}</span>
              )}
            </button>
          )
        })}
      </div>
    </Popover>
  )
}
