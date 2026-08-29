import { useEffect, type ReactElement } from 'react'
import type { Preset } from '../state/presets'
import { pageLabel } from './pages'
import './PresetSaved.css'

export interface PresetSavedProps {
  preset: Preset
  onDismiss: () => void
}

/** Long enough to read twice, short enough not to become furniture. */
const LINGER_MS = 6_000

/**
 * What just happened, and the code it happened under (BU-120).
 *
 * A save with no answer leaves you wondering whether it took, and a code
 * assigned but never shown is one nobody can search for — so this exists to
 * say both, once. It goes on its own rather than waiting to be closed: it
 * reports, it does not ask.
 */
export function PresetSaved({ preset, onDismiss }: PresetSavedProps): ReactElement {
  useEffect(() => {
    const timer = setTimeout(onDismiss, LINGER_MS)
    return () => {
      clearTimeout(timer)
    }
    // Keyed on the preset so re-saving restarts the clock rather than
    // inheriting the tail of the last one.
  }, [preset, onDismiss])

  return (
    <aside className="preset-saved" role="status" aria-label="Preset saved">
      <p className="preset-saved-head type-13">
        {preset.name} saved as <strong>{preset.code}</strong>
      </p>
      <p className="preset-saved-note type-11">
        Search {preset.code} from anywhere, or find it under Presets in the layout menu on{' '}
        {pageLabel(preset.page)}.
      </p>
    </aside>
  )
}
