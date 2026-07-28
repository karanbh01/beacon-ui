import type { ReactElement } from 'react'
import './SegmentedControl.css'

export interface Segment<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  className?: string
}

/**
 * Figma 266:2830 (the range control). Surface box at radius 4 with no
 * dividers between segments — the active wash alone marks position, which is
 * why adding separators makes it read as a row of buttons instead.
 *
 * Active takes sidebar-active-bg with 10px Medium accent, the same selection
 * wash used for table rows and sidebar pages (taxonomy 5).
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  className
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div
      className={['segmented', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={label ?? 'Options'}
    >
      {segments.map((segment) => {
        const active = segment.value === value
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? 'segment segment-active' : 'segment'}
            onClick={() => {
              onChange(segment.value)
            }}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
