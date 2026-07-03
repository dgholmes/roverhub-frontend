/**
 * Dashboard v0 — snapshot taken 2026-06-24.
 * Pixel-perfect LiveOps scaffold matching the RVR-01 "Atlas" reference screenshot.
 * This file and its siblings in snapshots/v0/ are FROZEN — do not edit them.
 * All active development happens in src/components/.
 */
import TopBar      from './TopBar'
import LeftSidebar from './LeftSidebar'
import LiveView    from './LiveView'
import CurrentTask from './CurrentTask'
import BottomBar   from './BottomBar'

export default function DashboardV0() {
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
