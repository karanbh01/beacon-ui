import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { Preset } from '../../state/presets'
import './PresetPicker.css'

export interface PresetPickerProps {
  /** Home has no panes, so it has no presets of its own. */
  arrangeable: boolean
  /** The page's saved presets. */
  presets: readonly Preset[]
  onApplyPreset: (id: string) => void
  onClose: () => void
}

/**
 * The page's presets at a glance (BU-275), in the middle of the window.
 * View → Presets… and Ctrl+Shift+P open it.
 *
 * Presets only (Karan): the built-in layouts are a click away in the layout
 * menu, and this is for getting back to an arrangement already made. One
 * list a keyboard can walk: arrows move, Enter takes, Escape or a click
 * outside leaves.
 */
export function PresetPicker({
  arrangeable,
  presets,
  onApplyPreset,
  onClose
}: PresetPickerProps): ReactElement {
  const [highlight, setHighlight] = useState(0)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The first preset, or the panel itself when there are none, so Escape
    // still reaches it.
    ;(rows.current[highlight] ?? panel.current)?.focus()
  }, [highlight])

  const take = (id: string): void => {
    onApplyPreset(id)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || presets.length === 0) return
    event.preventDefault()
    setHighlight((at) => (at + step + presets.length) % presets.length)
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="dropdown-surface layout-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Presets"
        onKeyDown={onKeyDown}
      >
        <p className="layout-menu-heading layout-picker-heading type-9">PRESETS</p>
        {!arrangeable && (
          <p className="layout-picker-empty type-11">
            Home has no panes, so it has no presets. Open a page to see its own.
          </p>
        )}
        {arrangeable && presets.length === 0 && (
          <p className="layout-picker-empty type-11">
            None for this page yet. View → Save layout as preset…
          </p>
        )}
        {arrangeable && presets.length > 0 && (
          <div role="listbox" aria-label="Presets">
            {presets.map((preset, index) => (
              <button
                key={preset.id}
                ref={(element) => {
                  rows.current[index] = element
                }}
                type="button"
                role="option"
                aria-selected={index === highlight}
                tabIndex={index === highlight ? 0 : -1}
                className="popover-row layout-picker-row"
                onMouseEnter={() => {
                  setHighlight(index)
                }}
                onClick={() => {
                  take(preset.id)
                }}
              >
                <span className="layout-picker-name">{preset.name}</span>
                <span className="popover-row-meta">{preset.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
