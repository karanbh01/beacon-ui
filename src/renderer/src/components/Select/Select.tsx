import type { ReactElement } from 'react'
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
  /** Flat options. Ignored when `groups` is given. */
  options?: readonly SelectOption[]
  /**
   * Options under headings, for a list long enough that a flat one cannot
   * be scanned (BU-190).
   *
   * A hundred trading calendars is not a list anybody reads top to bottom;
   * eight regions of a dozen is. The grouping comes from the data — the
   * calendar endpoint carries a region per row — rather than being decided
   * here, so a heading nobody anticipated appears rather than being lost.
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
  groups,
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  className
}: SelectProps): ReactElement {
  const flat = options ?? []
  // The label shown on the box comes from whichever set was supplied.
  const chosen = (groups === undefined ? flat : groups.flatMap((group) => group.options)).find(
    (option) => option.value === value
  )

  return (
    <span
      className={['select', disabled && 'select-disabled', className].filter(Boolean).join(' ')}
    >
      <span className="select-label" aria-hidden="true">
        {chosen?.label ?? placeholder ?? value}
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
        {groups === undefined
          ? flat.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
      </select>
    </span>
  )
}
