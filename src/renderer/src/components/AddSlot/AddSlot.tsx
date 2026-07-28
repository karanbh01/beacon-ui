import type { ReactElement } from 'react'
import './AddSlot.css'

export interface AddSlotProps {
  /** Written without the leading plus; the component supplies it. */
  label: string
  onClick?: () => void
  /** Left inset in px, to align under a numbered row's content column. */
  indent?: number
  className?: string
}

/**
 * Figma 325:1612. Dashed border means "empty slot" throughout the app
 * (taxonomy 9): + Add rule…, + Add constraint…, + Add index…, + Add block….
 *
 * A real button, not a styled div — it is the primary way to grow a
 * methodology, and it has to be reachable by keyboard.
 */
export function AddSlot({ label, onClick, indent = 0, className }: AddSlotProps): ReactElement {
  return (
    <div
      className={['add-slot-row', className].filter(Boolean).join(' ')}
      style={{ paddingLeft: indent }}
    >
      <button type="button" className="add-slot" onClick={onClick}>
        {`+  ${label}`}
      </button>
    </div>
  )
}
