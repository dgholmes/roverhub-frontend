import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
// Pretendard for Hangul (Outfit has none), bundled rather than fetched from a
// CDN so on-site consoles without internet still get it. The dynamic subset
// splits it into ~90 small files; a page downloads only the ranges it uses.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import './i18n'
import App from './App'
import { initTheme } from './lib/theme'

initTheme()

// React's development build records a performance.measure() for every
// component render (the "Components" track it offers the Chrome DevTools
// Performance panel), and the browser keeps user-timing entries until
// something clears them. On LiveOps that was 5,600 entries a second; one tab
// reached 2,058,684 entries and 2.9 GB before Chrome killed it with "Out of
// Memory" (2026-10-29), and clearing them freed 2 GB at once. Nothing here
// reads them back, so they are dropped on a timer. Development only: a
// production build records none.
if (import.meta.env.DEV) {
  setInterval(() => { performance.clearMeasures(); performance.clearMarks() }, 10_000)
}

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
