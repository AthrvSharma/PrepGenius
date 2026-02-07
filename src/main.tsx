import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { BlinkProvider, BlinkAuthProvider } from '@blinkdotnew/react'
import App from './App'
import './index.css'

const installRuntimeErrorOverlay = () => {
  const ensureOverlay = (message: string) => {
    let overlay = document.getElementById('runtime-error-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'runtime-error-overlay'
      overlay.style.position = 'fixed'
      overlay.style.inset = '0'
      overlay.style.background = 'rgba(5,6,15,0.92)'
      overlay.style.color = '#fff'
      overlay.style.zIndex = '99999'
      overlay.style.display = 'flex'
      overlay.style.alignItems = 'center'
      overlay.style.justifyContent = 'center'
      overlay.style.padding = '24px'
      overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif'
      document.body.appendChild(overlay)
    }
    overlay.innerHTML = `
      <div style="max-width:640px;text-align:center;">
        <div style="font-size:20px;font-weight:600;margin-bottom:10px;">UI crashed</div>
        <div style="font-size:13px;opacity:0.7;margin-bottom:14px;">${message}</div>
        <button onclick="window.location.reload()" style="padding:10px 18px;border-radius:999px;border:none;background:#7C3AED;color:white;font-weight:600;">Reload</button>
      </div>
    `
  }

  window.addEventListener('error', (event) => {
    ensureOverlay(event.message || 'Unknown error')
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = typeof event.reason === 'string' ? event.reason : event.reason?.message || 'Unhandled rejection'
    ensureOverlay(reason)
  })
}

installRuntimeErrorOverlay()

const projectId = import.meta.env.VITE_BLINK_PROJECT_ID || 'aiprep-platform-xunckkf6'
const publishableKey = import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || ''

const root = document.getElementById('root')
if (!root) {
  document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;">Root element not found.</div>'
  throw new Error('Root element not found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BlinkProvider 
      projectId={projectId}
      publishableKey={publishableKey}
    >
      <BlinkAuthProvider>
        <Toaster position="top-right" />
        <App />
      </BlinkAuthProvider>
    </BlinkProvider>
  </React.StrictMode>,
)
