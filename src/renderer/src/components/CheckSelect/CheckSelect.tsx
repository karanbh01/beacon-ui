import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './CheckSelect.css'

export interface CheckSelectProps {
  options: readonly string[]
  value: readonly string[]
  onChange: (value: string[]) => void
  /** Required: the control shows a summary, never a label. */
  label: string
  /** Shown when nothing is chosen. */
  placeholder?: string
  disabled?: boolean
}

/**
 * Choose several from a set (BU-91).
 *
 * `Select`'s sibling, and deliberately the same box — the two sit next to
 * each other in a filter row and any difference reads as a mistake. Where
 * `Select` hides a real `<select>` under that box, this cannot: a
 * `<select multiple>` renders its list INSIDE the page, and platform-drawn
 * `option` elements take neither our palette nor our selection colour, which
 * is exactly what made the row look unthemed in dark mode. `color-scheme`
 * fixes the popup a closed `<select>` opens; it cannot reach in-page options.
 *
 * So the list is ours, and checkboxes come with it. That is the other half of
 * the problem: multi-select by ctrl-click is invisible, and a plain click
 * silently REPLACES the selection rather than adding to it. A checkbox says
 * "more than one" without anyone being told.
 */
export function CheckSelect({
  options,
  value,
  onChange,
  label,
  placeholder = 'Choose…',
  disabled = false
}: CheckSelectProps): ReactElement {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  // Click-away and Escape, while open. Bound to the document because the
  // click that should close this can land anywhere, including another row.
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

  const toggle = (option: string): void => {
    onChange(
      value.includes(option) ? value.filter((chosen) => chosen !== option) : [...value, option]
    )
  }

  return (
    <span
      className={['check-select', disabled && 'check-select-disabled'].filter(Boolean).join(' ')}
      ref={box}
    >
      <button
        type="button"
        className="check-select-box"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={disabled}
        onClick={() => {
          setOpen(!open)
        }}
      >
        <span className="check-select-summary">{summarise(value, placeholder)}</span>
        <ChevronIcon size={10} className="check-select-chevron" />
      </button>

      {open && (
        <div className="dropdown-surface check-select-panel" role="group" aria-label={label}>
          {options.map((option) => (
            <label key={option} className="check-select-option type-11">
              <input
                type="checkbox"
                checked={value.includes(option)}
                onChange={() => {
                  toggle(option)
                }}
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </span>
  )
}

/**
 * What the closed control says.
 *
 * One value is named, because "1 selected" hides the thing the user most
 * wants to read back. Past that a count is the only honest summary that fits
 * — thirty-three sub industries will not.
 */
function summarise(value: readonly string[], placeholder: string): string {
  if (value.length === 0) return placeholder
  if (value.length === 1) return value[0] ?? placeholder
  return `${String(value.length)} selected`
}
