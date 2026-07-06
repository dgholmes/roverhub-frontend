import { useState, useEffect } from 'react'
import DesignSystemPage from './design-system/DesignSystemPage'
import { AppShell } from './app/AppShell'
import LegacyOriginalDashboard from './legacy/original/Dashboard'
import LegacyDashboardV0 from './legacy/v0/DashboardV0'
import LegacyDashboardTW from './legacy/tw/DashboardTW'

export default function App() {
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route === '#/design')          return <DesignSystemPage />
  if (route === '#/legacy/original') return <LegacyOriginalDashboard />
  if (route === '#/legacy/v0')       return <LegacyDashboardV0 />
  if (route === '#/legacy/tw')       return <LegacyDashboardTW />
  return <AppShell />
}
