import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './app.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Renderer root element #root is missing from index.html')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
