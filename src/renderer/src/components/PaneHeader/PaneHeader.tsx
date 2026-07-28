import type { ReactElement, ReactNode } from 'react'
import { TickerField } from '../TickerField/TickerField'
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
    const { subject, linkedTo, meta, onQuery, onSever, controls } = props
    return (
      <header className={classes}>
        <Left align="center">
          <TickerField
            subject={subject}
            {...(linkedTo === undefined ? {} : { linkedTo })}
            onQuery={onQuery}
            {...(onSever === undefined ? {} : { onSever })}
          />
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
