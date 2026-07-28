import type { ReactElement } from 'react'
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl'
import { THEME_PREFERENCES, type ThemeControl, type ThemePreference } from './theme'
import './ThemeSwitch.css'

/**
 * Theme picker. Uses the real SegmentedControl rather than a bespoke one —
 * the original had dividers between segments, which the Figma range control
 * (266:2830) does not.
 *
 * The final home for this is the menu bar (BU-15); this is its demo host.
 */
export function ThemeSwitch({ preference, mode, setPreference }: ThemeControl): ReactElement {
  const segments = THEME_PREFERENCES.map((option) => ({
    value: option,
    label: option === 'system' ? `system (${mode})` : option
  }))

  return (
    <SegmentedControl<ThemePreference>
      segments={segments}
      value={preference}
      onChange={setPreference}
      label="Theme"
      className="theme-switch"
    />
  )
}
