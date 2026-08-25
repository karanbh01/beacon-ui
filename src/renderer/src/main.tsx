import React, { type ReactElement } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { DataSettingsWindow } from './settings/DataSettingsWindow'
import { Splash } from './splash/Splash'
import { initTheme } from './state/theme'
import './app.css'

/**
 * One bundle, three windows.
 *
 * `#splash` is set by main when it opens the startup window (BU-66), and
 * `#settings` by the data-settings child it can open (BU-111). A second Vite
 * entry would mean a second HTML file and a second copy of the token and font
 * CSS to show a few lines of text — this is the cheaper seam, and every
 * window reuses the same IPC bridge and theme handling as a result.
 */
const route = window.location.hash

// Before render, deliberately: an effect would run after the first paint and
// the window would flash the fallback palette.
initTheme()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Renderer root element #root is missing from index.html')
}

function windowFor(hash: string): ReactElement {
  if (hash === '#splash') return <Splash />
  if (hash === '#settings') return <DataSettingsWindow />
  return <App />
}

ReactDOM.createRoot(root).render(<React.StrictMode>{windowFor(route)}</React.StrictMode>)
