import { useEffect, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button/Button'
import './Dialog.css'

export interface DialogProps {
  title: string
  /** One line under the title saying what the settings do. */
  note?: string
  children: ReactNode
  onClose: () => void
  /** Wider for a form with rows of fields; the default suits a few. */
  width?: number
}

/**
 * A pop-up over the pane: backdrop, canvas panel, title, note, Done.
 *
 * The shell Data Preferences, Data sources and the preset dialog each draw
 * for themselves, as one component for the settings a view keeps out of its
 * own layout (a backtest's assumptions, its capital and flows). Changes apply
 * as they are made, so Done only closes it; Escape and a click on the
 * backdrop do the same.
 *
 * Drawn into the body rather than where it is opened from: a table's column
 * button sits in a transformed header, and a transformed ancestor turns a
 * fixed backdrop into one the size of that header.
 */
export function Dialog({ title, note, children, onClose, width = 520 }: DialogProps): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <h2 className="dialog-title type-13">{title}</h2>
        {note !== undefined && <p className="dialog-note type-11">{note}</p>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-footer">
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
