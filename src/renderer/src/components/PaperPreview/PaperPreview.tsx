import type { CSSProperties, ReactElement, ReactNode } from 'react'
import './PaperPreview.css'

/** A4-ish proportions, fixed by the design (taxonomy 9). */
export const PAGE_WIDTH = 540
export const PAGE_HEIGHT = 764

export interface PaperPreviewProps {
  children: ReactNode
  /** Running header text, repeated on every page. */
  header?: string
  /** Footer provenance, e.g. "py-beacon 0.4.2 · generated 27 Jul 2026". */
  footer?: string
  page?: number
  pageCount?: number
  /** Rendered width; height follows the fixed 540:764 ratio. */
  width?: number
  className?: string
}

/**
 * A report page as it will print.
 *
 * Everything inside `.paper` is RAW INK — literal colours, no CSS custom
 * properties. That is deliberate and is the whole point of the component: a
 * factsheet is a print artefact shown on screen, so it must look identical in
 * light and dark, and identical to the PDF it becomes. The surrounding
 * chrome (the desk it sits on, the shadow) stays fully tokenised.
 *
 * Do not "fix" the hardcoded colours in PaperPreview.css by swapping them for
 * tokens — a test asserts they are not there.
 */
export function PaperPreview({
  children,
  header,
  footer,
  page,
  pageCount,
  width = PAGE_WIDTH,
  className
}: PaperPreviewProps): ReactElement {
  const scale = width / PAGE_WIDTH
  const style = {
    width,
    height: PAGE_HEIGHT * scale,
    // Content is authored at 540pt and scaled as a unit, so type and rules
    // keep their proportions at any preview size.
    '--paper-scale': scale
  } as CSSProperties

  const showFooter = footer !== undefined || page !== undefined

  return (
    <div className={['paper-desk', className].filter(Boolean).join(' ')}>
      <div className="paper" style={style}>
        <div className="paper-sheet">
          {header !== undefined && (
            <header className="paper-header">
              <span>{header}</span>
            </header>
          )}

          <div className="paper-body">{children}</div>

          {showFooter && (
            <footer className="paper-footer">
              <span>{footer}</span>
              {page !== undefined && (
                <span>
                  Page {page}
                  {pageCount === undefined ? '' : ` of ${String(pageCount)}`}
                </span>
              )}
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}

/** Page furniture: a titled block with the standard rule beneath. */
export function PaperSection({
  title,
  children
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="paper-section">
      <h3 className="paper-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** A label/value row in report typography, not app typography. */
export function PaperRow({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="paper-row">
      <span className="paper-row-label">{label}</span>
      <span className="paper-row-value">{value}</span>
    </div>
  )
}
