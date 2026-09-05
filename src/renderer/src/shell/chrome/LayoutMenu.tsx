import type { ReactElement } from 'react'
import { LAYOUT_OPTIONS, type LayoutOption } from '../../state/chrome'
import type { Preset } from '../../state/presets'
import { Popover } from './Popover'
import './LayoutMenu.css'

export interface LayoutMenuProps {
  open: boolean
  onClose: () => void
  value: string
  onSelect: (id: string) => void
  /**
   * Saved arrangements for the page this menu is acting on (BU-120).
   *
   * This page's only. The dropdown sits above one page's panes and its
   * layouts apply to that page, so offering another page's arrangements here
   * would be offering something this control cannot do.
   */
  presets?: readonly Preset[]
  onApplyPreset?: (id: string) => void
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
export function LayoutMenu({
  open,
  onClose,
  value,
  onSelect,
  presets = [],
  onApplyPreset
}: LayoutMenuProps): ReactElement {
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

      {/*
        The frame's Presets row, with the presets in it (BU-120).

        Applying lives here rather than in the View menu because this is the
        control that arranges this page — and a preset IS an arrangement, so
        it belongs beside the six that are not saved.
      */}
      <p className="layout-menu-heading type-9">PRESETS</p>

      {presets.length === 0 && (
        <p className="layout-menu-empty type-11">
          None for this page yet. View → Save layout as preset…
        </p>
      )}

      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="popover-row layout-menu-preset"
          onClick={() => {
            onApplyPreset?.(preset.id)
            onClose()
          }}
        >
          <span className="layout-menu-preset-name">{preset.name}</span>
          <span className="popover-row-meta">{preset.code}</span>
        </button>
      ))}
    </Popover>
  )
}
