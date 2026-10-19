import { useState, type ReactElement } from 'react'
import { HoldingColumnsDialog } from './HoldingColumnsDialog'

/**
 * A table's own column choice, from the right end of its column names
 * (Karan, 2026-10-19). Three bars for three columns: the table is what it
 * changes.
 */
export function HoldingColumnsButton({ table }: { table: string }): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="holding-columns-button"
        aria-label="Choose columns"
        title="Choose columns"
        onClick={() => {
          setOpen(true)
        }}
      >
        <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="3" height="9" fill="none" stroke="currentColor" />
          <rect x="4.5" y="0.5" width="3" height="9" fill="none" stroke="currentColor" />
          <rect x="8.5" y="0.5" width="3" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>
      {open && (
        <HoldingColumnsDialog
          table={table}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
