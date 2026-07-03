import { useState, useEffect } from 'react'
import TopBar           from './components/TopBar'
import LeftSidebar      from './components/LeftSidebar'
import LiveView         from './components/LiveView'
import CurrentTask      from './components/CurrentTask'
import BottomBar        from './components/BottomBar'
import DashboardV0      from './snapshots/v0/DashboardV0'
import DesignSystemPage from './design-system/DesignSystemPage'
import DashboardTW      from './migration/DashboardTW'

function Dashboard() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      background: '#0B0B0D',
      fontFamily: "'Outfit', system-ui, sans-serif",
    }}>
      <TopBar active="Dashboard" />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <LeftSidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <LiveView />
          <CurrentTask />
        </div>
      </div>
      <BottomBar />
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route === '#/v0')     return <DashboardV0 />
  if (route === '#/tw')     return <DashboardTW />
  if (route === '#/design') return <DesignSystemPage />
  return <Dashboard />
}
