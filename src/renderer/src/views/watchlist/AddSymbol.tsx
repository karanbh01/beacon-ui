import { useState, type ReactElement } from 'react'
import './AddSymbol.css'

export interface AddSymbolProps {
  onAdd: (symbol: string) => void
  disabled?: boolean
}

/**
 * Figma 302:3269, the "+ Add symbol…" affordance in the watchlist header.
 *
 * A dashed slot until it is clicked, then a field — the same grammar as
 * AddSlot, but it collects a value rather than opening a picker, so it cannot
 * reuse that component. Uppercases on commit because py-beacon's identifiers
 * are, and a lowercase ticker would simply 404.
 */
export function AddSymbol({ onAdd, disabled = false }: AddSymbolProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  const commit = (): void => {
    const symbol = value.trim().toUpperCase()
    setValue('')
    setOpen(false)
    if (symbol !== '') onAdd(symbol)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="add-symbol"
        disabled={disabled}
        onClick={() => {
          setOpen(true)
        }}
      >
        +&nbsp;&nbsp;Add symbol…
      </button>
    )
  }

  return (
    <input
      className="add-symbol-input"
      aria-label="Add symbol"
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
