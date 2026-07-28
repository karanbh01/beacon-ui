import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './FieldRow.css'

export interface FieldRowProps {
  label: string
  value?: ReactNode
  children?: ReactNode
  chevron?: boolean
  /**
   * Derived values the user cannot edit — Net carry rate, Time to expiry,
   * Term, Business days. Canvas fill, divider border, secondary text
   * (taxonomy 8), so a computed cell never looks like an input.
   */
  readOnly?: boolean
  className?: string
}

/**
 * The pricer grammar (taxonomy 8): an 11px muted label in a FIXED left rail,
 * then a FIXED-width box. Both widths come from the enclosing FieldGrid, so a
 * whole form shares one rail and every box lines up.
 *
 * Distinct from Field, which stacks its label above the box for headers and
 * filters. Pricers are calculators, not blotters, and read as forms.
 */
export function FieldRow({
  label,
  value,
  children,
  chevron = false,
  readOnly = false,
  className
}: FieldRowProps): ReactElement {
  const classes = ['field-row', readOnly && 'field-row-readonly', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <span className="field-row-label">{label}</span>
      <div className="field-row-box">
        {children ?? <span className="field-row-value">{value}</span>}
        {chevron && !readOnly && <ChevronIcon size={10} className="field-row-chevron" />}
      </div>
    </div>
  )
}

export interface FieldGridProps {
  children: ReactNode
  /** Rail width in px. 118 on the futures pricer, 122 on TRS. */
  railWidth?: number
  /** Box width in px. 175 on the futures pricer, 170 on TRS. */
  boxWidth?: number
  className?: string
}

/**
 * Owns the two fixed widths and the 40px column gap. Rows are laid out by
 * FieldRowGroup rather than by an auto-flowing grid, because the rhythm is
 * semantic: an anchor field stands alone, parallel params pair up.
 */
export function FieldGrid({
  children,
  railWidth = 118,
  boxWidth = 175,
  className
}: FieldGridProps): ReactElement {
  const style = {
    '--rail-width': `${String(railWidth)}px`,
    '--box-width': `${String(boxWidth)}px`
  } as CSSProperties

  return (
    <div className={['field-grid', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}

/**
 * One row carrying one or two fields. A single field sits flush left at
 * column width — never stretched to fill the row, never centred, never
 * offset (taxonomy 8). That falls out of the row being a plain flex with no
 * grow on its children.
 */
export function FieldRowGroup({ children }: { children: ReactNode }): ReactElement {
  return <div className="field-row-group">{children}</div>
}

/** 9px Medium at 6% tracking, muted (taxonomy 8). */
export function FieldSection({ title }: { title: string }): ReactElement {
  return <h3 className="field-section">{title}</h3>
}
