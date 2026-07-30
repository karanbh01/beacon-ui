import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import './WindowControls.css'

/**
 * Minimise / maximise / close, drawn by the renderer because the window is
 * frameless (BU-37). Figma 81:72–81:76, at the right edge of the menu bar.
 *
 * Rendered only off macOS — there the OS draws traffic lights, inset onto the
 * bar by `trafficLightPosition`, and a second set would be wrong.
 */
export function WindowControls(): ReactElement | null {
  const [maximized, setMaximized] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    const api = window.beacon?.window
    if (api === undefined) return undefined

    let live = true
    void api
      .isMaximized()
      .then((value) => {
        if (!live) return
        setMaximized(value)
        setSupported(true)
      })
      .catch(() => {
        // No window API (browser, or a dead bridge). Draw nothing rather
        // than buttons that cannot work.
      })

    const unsubscribe = api.onMaximizeChange(setMaximized)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  if (!supported) return null

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-btn"
        aria-label="Minimise"
        onClick={() => {
          void window.beacon?.window.minimize()
        }}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <button
        type="button"
        className="win-btn"
        aria-label={maximized ? 'Restore' : 'Maximise'}
        aria-pressed={maximized}
        onClick={() => {
          void window.beacon?.window.toggleMaximize().then(setMaximized)
        }}
      >
        {maximized ? (
          // Restore: two offset rounded squares, as the frame draws it.
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect
              x="3.2"
              y="0.6"
              width="8.2"
              height="7.6"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <rect
              x="0.6"
              y="3.4"
              width="8.2"
              height="7.6"
              rx="2"
              fill="var(--canvas)"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect
              x="0.9"
              y="0.9"
              width="10.2"
              height="10.2"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="win-btn win-close"
        aria-label="Close"
        onClick={() => {
          void window.beacon?.window.close()
        }}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <line x1="0.6" y1="0.6" x2="9.4" y2="9.4" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9.4" y1="0.6" x2="0.6" y2="9.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}
