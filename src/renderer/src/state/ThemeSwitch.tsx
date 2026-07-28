import type { ReactElement } from 'react'
import { THEME_PREFERENCES, type ThemeControl } from './theme'
import './ThemeSwitch.css'

/**
 * Segmented control over light / dark / system. The real one lives in the
 * menu bar (BU-15); this is its demo host.
 */
export function ThemeSwitch({ preference, mode, setPreference }: ThemeControl): ReactElement {
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          className={option === preference ? 'seg active' : 'seg'}
          aria-pressed={option === preference}
          onClick={() => {
            setPreference(option)
          }}
        >
          {option === 'system' ? `system (${mode})` : option}
        </button>
      ))}
    </div>
  )
}
