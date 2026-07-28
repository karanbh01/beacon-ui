import type { ReactElement, ReactNode } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './Field.css'

export interface FieldProps {
  label: string
  /** Display value. Ignored when `children` is supplied. */
  value?: ReactNode
  /** Custom box contents, for a real input or a composed control. */
  children?: ReactNode
  chevron?: boolean
  /** Box width in px. Figma's atom is 160; headers and filters vary. */
  width?: number
  className?: string
}

/**
 * Figma 388:147. Label above the box — the header and filter grammar.
 * The pricer grammar puts its label in a left rail instead; that is FieldRow.
 *
 * Presentational by design: views supply a real input through `children` when
 * they need one, so this stays the single source of the box geometry.
 */
export function Field({
  label,
  value,
  children,
  chevron = false,
  width = 160,
  className
}: FieldProps): ReactElement {
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <span className="field-label">{label}</span>
      <div className="field-box" style={{ width }}>
        {children ?? <span className="field-value">{value}</span>}
        {chevron && <ChevronIcon size={10} className="field-chevron" />}
      </div>
    </div>
  )
}
