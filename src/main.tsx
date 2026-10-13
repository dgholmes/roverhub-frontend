import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import './i18n'
import App from './App'
import { initTheme } from './lib/theme'

initTheme()

// Review builds can open on a given screen (VITE_START_HASH, e.g.
// "#/site/site-north-yard/liveops") instead of the Sites list. Only applies
// when the URL names no route of its own.
const startHash = import.meta.env.VITE_START_HASH as string | undefined
if (startHash && !window.location.hash) {
  try { window.history.replaceState(null, '', startHash) } catch { window.location.hash = startHash }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
