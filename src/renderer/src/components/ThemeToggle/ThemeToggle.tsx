import type { ReactElement } from 'react'
import type { ThemeMode } from '../../tokens/tokens'
import { SpinIcon } from './SpinIcon'
import './ThemeToggle.css'

export interface ThemeToggleProps {
  /** The mode on screen now, after `system` has been resolved. */
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
  className?: string
}

/**
 * Light/dark switch, with the sun/moon morphing as the knob travels.
 *
 * `role="switch"` rather than two radio buttons: the control has two states
 * and expresses one of them, which is what a switch is for, and it keeps the
 * footer to a single 30px target instead of a segmented control that would
 * be louder than the 11px status text beside it.
 *
 * Binary on purpose. `system` stays the default and keeps tracking the OS
 * live until someone touches this, at which point they have said which one
 * they want — which is the manual override BU-39 is about. A three-state
 * control puts "system" on screen as a thing to pick, and it is really the
 * absence of a pick.
 */
export function ThemeToggle({ mode, onChange, className }: ThemeToggleProps): ReactElement {
  const dark = mode === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light' : 'Switch to dark'}
      className={['theme-toggle', className].filter(Boolean).join(' ')}
      onClick={() => {
        onChange(dark ? 'light' : 'dark')
      }}
    >
      <span className="theme-toggle-knob">
        <SpinIcon dark={dark} />
      </span>
    </button>
  )
}
