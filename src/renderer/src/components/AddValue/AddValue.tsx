import { useState, type ReactElement } from 'react'
import './AddValue.css'

export interface AddValueProps {
  /** Written without the leading plus; the component supplies it. */
  label: string
  onAdd: (value: string) => void
  disabled?: boolean
  /** py-beacon's identifiers are uppercase, and a lowercase one just 404s. */
  uppercase?: boolean
}

/**
 * Figma 302:3269 and 289:2844 — "+ Add symbol…", "+ Add asset…".
 *
 * A dashed slot until it is clicked, then a field. The same grammar as
 * AddSlot, but it collects a value rather than opening a picker, which is why
 * it cannot reuse that component.
 */
export function AddValue({
  label,
  onAdd,
  disabled = false,
  uppercase = true
}: AddValueProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  const commit = (): void => {
    const entered = value.trim()
    setValue('')
    setOpen(false)
    if (entered !== '') onAdd(uppercase ? entered.toUpperCase() : entered)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="add-value"
        disabled={disabled}
        onClick={() => {
          setOpen(true)
        }}
      >
        +&nbsp;&nbsp;{label}
      </button>
    )
  }

  return (
    <input
      className={uppercase ? 'add-value-input add-value-upper' : 'add-value-input'}
      aria-label={label}
      autoFocus
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          // Escape abandons the entry; blur would otherwise commit it.
          setValue('')
          setOpen(false)
        }
      }}
    />
  )
}
