import type { ReactElement } from 'react'
import { ChevronIcon } from '../../icons/generated'
import { LAYOUT_OPTIONS, type LayoutOption } from '../../state/chrome'
import { Popover } from './Popover'
import './LayoutMenu.css'

export interface LayoutMenuProps {
  open: boolean
  onClose: () => void
  value: string
  onSelect: (id: string) => void
}

/** The 24x24 glyph, drawn from the option's own pane rectangles. */
function LayoutGlyph({ option }: { option: LayoutOption }): ReactElement {
  return (
    <span className="layout-glyph" aria-hidden="true">
      {option.panes.map((pane) => (
        <span
          key={`${String(pane.x)}-${String(pane.y)}`}
          className="layout-glyph-pane"
          style={{ left: pane.x, top: pane.y, width: pane.w, height: pane.h }}
        />
      ))}
    </span>
  )
}

/**
 * Figma 119:2. Five arrangements in a row, a rule, then a Presets row.
 *
 * The options are a radio group rather than five buttons: they are one
 * choice, and a screen reader should hear which is taken.
 */
export function LayoutMenu({ open, onClose, value, onSelect }: LayoutMenuProps): ReactElement {
  return (
    <Popover open={open} onClose={onClose} label="Layout" className="layout-menu">
      <div className="layout-menu-options" role="radiogroup" aria-label="Pane layout">
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            aria-label={option.label}
            title={option.label}
            className={`layout-option${option.id === value ? ' layout-option-active' : ''}`}
            onClick={() => {
              onSelect(option.id)
              onClose()
            }}
          >
            <LayoutGlyph option={option} />
          </button>
        ))}
      </div>

      <div className="popover-divider" />

      {/* Presets have no store behind them yet; the row is in the frame and
          disabled rather than absent, so its place in the panel is right when
          there is something to put in it. */}
      <button type="button" className="popover-row layout-menu-presets" disabled>
        Presets
        <ChevronIcon size={10} />
      </button>
    </Popover>
  )
}
