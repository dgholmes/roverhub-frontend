import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import DesignSystemPage from './design-system/DesignSystemPage'
import { AppShell } from './app/AppShell'
import { AuthGate } from './components/auth/AuthGate'
import LegacyOriginalDashboard from './legacy/original/Dashboard'
import LegacyDashboardV0 from './legacy/v0/DashboardV0'
import LegacyDashboardTW from './legacy/tw/DashboardTW'
import LiveOpsV1Page from './legacy/liveops-v1/LiveOpsV1Page'

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
        : <AppShell />}
    </AuthGate>
  )
}
