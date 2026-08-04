import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { Splash } from './splash/Splash'
import { initTheme } from './state/theme'
import './app.css'

/**
 * One bundle, two windows.
 *
 * `#splash` is set by main when it opens the startup window (BU-66). A second
 * Vite entry would mean a second HTML file and a second copy of the token and
 * font CSS to show four lines of text — this is the cheaper seam, and the
 * splash reuses the same IPC bridge and theme handling as a result.
 */
const isSplash = window.location.hash === '#splash'

// Before render, deliberately: an effect would run after the first paint and
// the window would flash the fallback palette.
initTheme()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Renderer root element #root is missing from index.html')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>{isSplash ? <Splash /> : <App />}</React.StrictMode>
)
