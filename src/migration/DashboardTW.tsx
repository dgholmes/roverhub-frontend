/**
 * DashboardTW — Tailwind + shadcn migration of the RoverHub LiveOps dashboard.
 * Compare against the original at / (inline styles) to see the difference.
 * Route: #/tw
 */
import TopBar      from './TopBar'
import LeftSidebar from './LeftSidebar'
import LiveView    from './LiveView'
import CurrentTask from './CurrentTask'
import BottomBar   from './BottomBar'

export default function DashboardTW() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-rh-bg font-sans">
      <TopBar active="Dashboard" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <LiveView />
          <CurrentTask />
        </div>
      </div>
      <BottomBar />
    </div>
  )
}
