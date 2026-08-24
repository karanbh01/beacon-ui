import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '../Button/Button'
import './MenuButton.css'

export interface MenuChoice {
  value: string
  label: string
  /** Present means inert, and says why on the item itself. */
  blocked?: string
}

export interface MenuButtonProps {
  label: string
  choices: readonly MenuChoice[]
  onChoose: (value: string) => void
  disabled?: boolean
  /** Ticked in the list — for a control that reports a current setting. */
  value?: string
}

/**
 * A header button that opens a short list (BU-106).
 *
 * The chevron buttons in the view headers — Daily, Adjusted, Export — have
 * always drawn a chevron and done nothing. This is the list behind it.
 *
 * The surface is `tokens/surface.css`, shared with the menu-bar dropdowns and
 * the checkbox select, so the app has one dropdown ground rather than three
 * that drift. Deliberately not a `<select>`: Export is an action, and a
 * select that fires on change and then shows the chosen value would claim
 * "csv" is now a setting.
 */
export function MenuButton({
  label,
  choices,
  onChoose,
  disabled = false,
  value
}: MenuButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return undefined

    const onDown = (event: MouseEvent): void => {
      if (box.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="menu-button" ref={box}>
      <Button
        chevron
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen(!open)
        }}
      >
        {label}
      </Button>

      {open && (
        <div className="dropdown-surface menu-button-list" role="menu" aria-label={label}>
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitem"
              className="menu-button-item type-11"
              disabled={choice.blocked !== undefined}
              {...(choice.blocked === undefined ? {} : { title: choice.blocked })}
              onClick={() => {
                setOpen(false)
                onChoose(choice.value)
              }}
            >
              <span className="menu-button-tick" aria-hidden="true">
                {choice.value === value ? '✓' : ''}
              </span>
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
