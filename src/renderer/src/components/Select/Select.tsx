import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectGroup {
  label: string
  options: readonly SelectOption[]
}

export interface SelectProps {
  /** Flat options. Ignored when `groups` is supplied. */
  options?: readonly SelectOption[]
  /**
   * Options under headings, for a list long enough that a flat one cannot
   * be scanned (BU-190).
   *
   * A hundred trading calendars is not a list anybody reads top to bottom;
   * eight regions of a dozen is. The grouping comes from the data rather
   * than being decided here, so a heading nobody anticipated appears rather
   * than being lost.
   */
  groups?: readonly SelectGroup[]
  value: string
  onChange: (value: string) => void
  /** Required: the control shows only its current value, never a label. */
  label: string
  /**
   * Shown when no option matches the value — which is what an empty option
   * list looks like. Without it the control collapses to an empty box, and an
   * empty box says nothing about why there is nothing to choose.
   */
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * The chevron control Figma draws for an open option set — "Core Tech ▾",
 * "All sources ▾", "All datasets ▾" (302:3069, 302:3267).
 *
 * The list is ours rather than the platform's (BU-196). It was a real
 * `<select>` under a styled box, which bought keyboard handling and typeahead
 * for free — and rendered its options through the OS, which takes neither our
 * palette nor our selection colour. In dark mode that is a white list under a
 * dark field, which is what Karan reported.
 *
 * `CheckSelect` met the same wall for multi-select and reached the same
 * conclusion; this brings the two into line, and both now draw on the shared
 * `.dropdown-surface` the search bar and the menu bar use. What that costs is
 * the keyboard behaviour the platform gave away, so it is reimplemented here:
 * arrows, Home and End, Enter, Escape, and typeahead.
 *
 * Distinct from SegmentedControl, which shows every option at once. Use that
 * for a small closed set (a date range), this for a set that grows.
 */
export function Select({
  options,
  groups,
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  className
}: SelectProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })

  /** Every option in render order, which is what the arrows walk. */
  const flat = useMemo(
    () => (groups === undefined ? [...(options ?? [])] : groups.flatMap((group) => group.options)),
    [options, groups]
  )
  const chosen = flat.find((option) => option.value === value)

  // Opening lands on the current value rather than at the top: the list is
  // showing what is already chosen, so that is where the keyboard is.
  useEffect(() => {
    if (!open) return
    setActive(flat.findIndex((option) => option.value === value))
  }, [open, flat, value])

  // Click-away and Escape, while open. Bound to the document because the
  // click that should close this can land anywhere.
  useEffect(() => {
    if (!open) return

    const onDown = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  /** Keep the highlight in view — a list of a hundred is taller than the panel. */
  useEffect(() => {
    if (!open || active < 0) return
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView({
      block: 'nearest'
    })
  }, [open, active])

  const commit = (option: SelectOption): void => {
    onChange(option.value)
    setOpen(false)
  }

  const move = (delta: number): void => {
    if (flat.length === 0) return
    setActive((current) => {
      const next = current + delta
      if (next < 0) return flat.length - 1
      if (next >= flat.length) return 0
      return next
    })
  }

  /**
   * Typeahead, which the platform list gave for free.
   *
   * Letters within a second of each other extend the search rather than
   * restarting it, so "ne" reaches New York where "n" then "e" would land on
   * the first E.
   */
  const seek = (character: string): void => {
    const now = Date.now()
    const text = (now - typed.current.at < 1000 ? typed.current.text : '') + character.toLowerCase()
    typed.current = { text, at: now }

    const found = flat.findIndex((option) => option.label.toLowerCase().startsWith(text))
    if (found >= 0) setActive(found)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (disabled) return

    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(flat.length - 1)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const option = flat[active]
      if (option !== undefined) {
        event.preventDefault()
        commit(option)
      }
    } else if (event.key.length === 1) {
      seek(event.key)
    }
  }

  let index = -1

  return (
    <span
      className={['select', disabled && 'select-disabled', className].filter(Boolean).join(' ')}
      ref={box}
    >
      <button
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        // What is chosen, by identity rather than by the label shown — the
        // trigger has no value to read now that it is not an input.
        data-value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onClick={() => {
          setOpen(!open)
        }}
      >
        <span className="select-value">{chosen?.label ?? placeholder ?? value}</span>
        <ChevronIcon size={10} className="select-chevron" />
      </button>

      {open && (
        <div className="dropdown-surface select-panel" role="listbox" aria-label={label} ref={list}>
          {(groups ?? [{ label: '', options: options ?? [] }]).map((group) => (
            <div key={group.label}>
              {group.label !== '' && <p className="popover-heading">{group.label}</p>}
              {group.options.map((option) => {
                index += 1
                const at = index
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    // The stored value, for tests and for anything keying on
                    // identity rather than on a label that may be renamed.
                    data-value={option.value}
                    className={[
                      'popover-row',
                      'select-option',
                      at === active && 'select-option-active',
                      option.value === value && 'select-option-chosen'
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    // Mouse down would take focus off the trigger and close
                    // the panel before the click ever landed.
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onMouseEnter={() => {
                      setActive(at)
                    }}
                    onClick={() => {
                      commit(option)
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
