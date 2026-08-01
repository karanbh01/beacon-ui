import type { ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  options: readonly SelectOption[]
  value: string
  onChange: (value: string) => void
  /** Required: the control shows only its current value, never a label. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * The chevron control Figma draws for an open option set — "Core Tech ▾",
 * "All sources ▾", "All datasets ▾" (302:3069, 302:3267).
 *
 * A real `<select>` under a styled box rather than a custom popup: it gets
 * keyboard handling, typeahead and the platform's own list rendering for
 * free, and a bespoke menu would have to reimplement all three to be usable.
 * The chevron is ours because the native arrow cannot be recoloured per
 * theme; the element itself is transparent and sits on top.
 *
 * Distinct from SegmentedControl, which shows every option at once. Use that
 * for a small closed set (a date range), this for a set that grows.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className
}: SelectProps): ReactElement {
  return (
    <span
      className={['select', disabled && 'select-disabled', className].filter(Boolean).join(' ')}
    >
      <span className="select-label" aria-hidden="true">
        {options.find((option) => option.value === value)?.label ?? value}
      </span>
      <ChevronIcon size={10} className="select-chevron" />
      <select
        className="select-native"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
