import { useTranslation } from 'react-i18next'
import { lazy, Suspense, useState, useEffect } from 'react'
import DesignSystemPage from './design-system/DesignSystemPage'
import { AppShell } from './app/AppShell'
import { AuthGate } from './components/auth/AuthGate'
import LegacyOriginalDashboard from './legacy/original/Dashboard'
import LegacyDashboardV0 from './legacy/v0/DashboardV0'
import LegacyDashboardTW from './legacy/tw/DashboardTW'
import LiveOpsV1Page from './legacy/liveops-v1/LiveOpsV1Page'

// Dev-only map scene harness (#/dev/scene). The DEV check is compile-time, so
// a production build drops the import and the chunk with it.
const SceneLab = import.meta.env.DEV ? lazy(() => import('./components/scene/SceneLab')) : null

export default function App() {
  // Subscribing here re-renders the whole tree when the language changes, so
  // text from plain modules (state labels via i18n.t) updates too.
  useTranslation()
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // The design showcase holds no data, so it needs no sign-in. Everything
  // else, legacy dashboards included, reads robots and so sits behind the gate.
  if (route === '#/design')            return <DesignSystemPage />
  return (
    <AuthGate>
      {route === '#/legacy/original' ? <LegacyOriginalDashboard />
        : route === '#/legacy/v0' ? <LegacyDashboardV0 />
        : route === '#/legacy/tw' ? <LegacyDashboardTW />
        : route === '#/legacy/liveops-v1' ? <LiveOpsV1Page />
        : SceneLab && route === '#/dev/scene' ? <Suspense fallback={null}><SceneLab /></Suspense>
        : <AppShell />}
    </AuthGate>
  )
}
