import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initTheme } from './state/theme'
import './app.css'

// Before render, deliberately: an effect would run after the first paint and
// the window would flash the fallback palette.
initTheme()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Renderer root element #root is missing from index.html')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
