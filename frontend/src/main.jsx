import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import { applyThemeSettings } from './components/dashboard/SettingsDrawer'

window.addEventListener('unhandledrejection', (event) => {
  if (window.__CRM_SHOULD_IGNORE_BROWSER_NOISE__?.(event.reason)) {
    event.preventDefault()
  }
}, true)

try {
  applyThemeSettings(JSON.parse(localStorage.getItem('crm_theme_settings') || '{}'))
} catch {
  applyThemeSettings({})
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
