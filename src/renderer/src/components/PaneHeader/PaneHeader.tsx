import type { ReactElement, ReactNode } from 'react'
import { TickerField } from '../TickerField/TickerField'
import type { Suggestion } from '../TickerField/suggestions'
import '../Field/Field.css'
import './PaneHeader.css'

interface CommonProps {
  /**
   * Real children, not pre-provisioned slots. Figma has to expose four fixed
   * action props because instances cannot gain children; React does not, so
   * callers pass whatever the view needs.
   */
  controls?: ReactNode
  className?: string
}

export interface QueryHeaderProps extends CommonProps {
  kind: 'query'
  subject: string
  /** Present when the subject follows another tab (taxonomy 1, archetype 6). */
  linkedTo?: string
  meta?: ReactNode
  onQuery: (subject: string) => void
  onSever?: () => void
  /** Dataset this view needs, so a suggestion it cannot serve is marked. */
  requires?: string
  /** Suggest from this list rather than from identifier search (BU-166). */
  index?: readonly Suggestion[]
  /** A second field after the query, such as the backtest a name is drilled into in. */
  beside?: ReactNode
  /**
   * Small text over the query box, as a header field's label is; for a
   * header with two fields to tell apart (Karan, 2026-11-27).
   */
  label?: string
}

export interface DocumentHeaderProps extends CommonProps {
  kind: 'document'
  title: string
  meta?: ReactNode
  /** Unsaved-change text, e.g. "1 unsaved change". Shown with a leading dot. */
  status?: ReactNode
}

export interface FieldsHeaderProps extends CommonProps {
  kind: 'fields'
  /** The Field controls themselves; they align on their boxes, not labels. */
  children: ReactNode
}

export type PaneHeaderProps = QueryHeaderProps | DocumentHeaderProps | FieldsHeaderProps

/** A header box with small text over it, as Field puts its label (Figma 388:147). */
export function HeaderLabel({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

function Left({ children, align }: { children: ReactNode; align: 'center' | 'end' }): ReactElement {
  return <div className={`pane-header-left align-${align}`}>{children}</div>
}

/**
 * Figma set 388:11538, demo strip 388:11539.
 *
 * One `kind` covers linked query as well as plain query: linked is a property
 * of the nested TickerField, not a header variant (taxonomy 4).
 */
export function PaneHeader(props: PaneHeaderProps): ReactElement {
  const classes = ['pane-header', props.className].filter(Boolean).join(' ')

  if (props.kind === 'query') {
    const { subject, linkedTo, meta, onQuery, onSever, requires, index, beside, label, controls } =
      props
    const field = (
      <TickerField
        subject={subject}
        {...(linkedTo === undefined ? {} : { linkedTo })}
        onQuery={onQuery}
        {...(onSever === undefined ? {} : { onSever })}
        {...(requires === undefined ? {} : { requires })}
        {...(index === undefined ? {} : { index })}
      />
    )
    return (
      <header className={label === undefined ? classes : `${classes} is-labelled`}>
        {/* Labelled boxes bottom-align, as the fields header's do, so the boxes agree. */}
        <Left align={label === undefined ? 'center' : 'end'}>
          {label === undefined ? field : <HeaderLabel label={label}>{field}</HeaderLabel>}
          {beside}
          {meta !== undefined && <span className="pane-header-meta">{meta}</span>}
        </Left>
        <div className="pane-header-controls">{controls}</div>
      </header>
    )
  }

  if (props.kind === 'document') {
    const { title, meta, status, controls } = props
    return (
      <header className={classes}>
        <Left align="center">
          <h2 className="pane-header-title">{title}</h2>
          {meta !== undefined && <span className="pane-header-meta">{meta}</span>}
          {status !== undefined && (
            <span className="pane-header-status">
              <span aria-hidden="true">&#9679;</span> {status}
            </span>
          )}
        </Left>
        <div className="pane-header-controls">{controls}</div>
      </header>
    )
  }

  // Fields align on their boxes, so the row is bottom-aligned — labels sit
  // above boxes of equal height and centring would stagger the boxes.
  return (
    <header className={classes}>
      <Left align="end">{props.children}</Left>
      <div className="pane-header-controls">{props.controls}</div>
    </header>
  )
}
