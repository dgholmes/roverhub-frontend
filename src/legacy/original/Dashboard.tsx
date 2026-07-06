import TopBar           from './TopBar'
import LeftSidebar      from './LeftSidebar'
import LiveView         from './LiveView'
import CurrentTask      from './CurrentTask'
import BottomBar        from './BottomBar'

/**
 * Preserved copy of the original placeholder dashboard, superseded by the
 * PRD-aligned LiveOps workspace. Kept for reference at #/legacy/original —
 * not part of the live app, not maintained going forward.
 */
export default function Dashboard() {
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
