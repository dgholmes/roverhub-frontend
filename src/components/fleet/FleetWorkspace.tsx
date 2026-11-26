import { useSiteRobots } from '@/org/useSiteRobots'
import { useEffect, useState } from 'react'
import { fleetRouteFromHash, hashForFleet, type InspectorTab } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { FleetRobotsView } from './v2/FleetRobotsView'
import { useTouchShell } from '@/lib/useTouchShell'

/** The robot Fleet opens on when the address names none -- see the seed rules
 * in FleetWorkspace. Read from the store rather than subscribed to, because it
 * is a starting point, not a binding. Narrow has none: it opens on the roster,
 * and a link that means a robot names it in the address. */
function seedRobot(narrow: boolean): string | null {
  return narrow ? null : useSessionStore.getState().selectedRobotId
}

/** The address, or none where there is no window (a server render). */
function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash
}

/** Put `hash` in the address in place: a reload or a copied link reopens it,
 * and it is not a step for Back, which still leaves Fleet. */
function replaceHash(hash: string) {
  if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
}

/**
 * Fleet workspace (docs/01-prd.md §9, docs/05-ui-ux.md §10): the detailed
 * home of device status. LiveOps only shows compact summaries; here each robot
 * gets an attention-sorted roster entry and a full inspector (Overview,
 * Motors, Sensors, Motion tests, Logs, Edge device), and nothing else: Docks
 * had a tab of its own above the roster until 2026-11-26, and comes back
 * when there is a dock to show.
 *
 * Each robot's edge device lives in its inspector, since a bridge serves one
 * robot.
 */
export function FleetWorkspace({ siteId: siteIdProp }: { siteId?: string } = {}) {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useSiteRobots()
  const { narrow } = useTouchShell()
  // SiteShell renders a site's workspaces only once the session is on it, so
  // the session's site is this one when no prop says otherwise.
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const siteId = siteIdProp ?? activeSiteId
  // What Fleet shows lives in the address (hashForFleet): the robot inspected
  // and the inspector's tab, so a reload or a copied link reopens them
  // (2026-11-26: a reload swapped the rover-jetson the operator was inspecting
  // for the session's rover-pi). Everything below about the seed applies only
  // when the address names no robot, or names one this site no longer has.
  //
  // The seed comes from the session-shared selection so arriving from LiveOps
  // or the Dashboard opens that robot directly (docs/05-ui-ux.md §2.3). A one-time
  // seed, not a live binding, so browsing robots here doesn't change LiveOps'
  // own selection. At any width of 700 px or more this is the desktop
  // behaviour, touch or not: roster and inspector side by side, a robot in it.
  //
  // Narrow is different, because there the inspector *replaces* the roster.
  // The session selection is almost never null -- `reconcileSelectedRobot`
  // puts it on `robotIds[0]` whenever it is invalid and the site has robots,
  // and SiteShell calls it on every site entry -- so falling back to it would
  // open a phone straight into an inspector nobody asked for, with the roster
  // hidden behind a back button. Narrow opens a bare address on the roster,
  // and a link that means a robot names it in the address.
  //
  // This is a layout rule, so it hangs off `narrow`, never `touch`: a 1366 px
  // tablet has room for both panes and gets them (2026-11-26).
  //
  // `picked` is the robot the address or the operator named; `seed` stands in
  // for it while it is not one of this site's robots. Both are kept rather
  // than resolved once, because the site's robots may still be loading when
  // the address is read -- and the address is never rewritten for a robot
  // that is not (yet) on the site.
  const [view, setView] = useState(() => {
    const route = fleetRouteFromHash(currentHash())
    return {
      picked: route?.robotId ?? null,
      seed: seedRobot(narrow),
      inspectorTab: route?.inspectorTab ?? 'overview' as InspectorTab,
    }
  })
  const { inspectorTab } = view
  const onSite = (id: string | null) => id !== null && robots.some((r) => r.robot_id === id)
  const selectedRobotId = onSite(view.picked) ? view.picked : onSite(view.seed) ? view.seed : null

  // Back and Forward while Fleet stays mounted change only the address, so
  // follow it. An address that is not Fleet's is the shell on its way out.
  useEffect(() => {
    const follow = () => {
      const route = fleetRouteFromHash(window.location.hash)
      if (!route) return
      setView({ picked: route.robotId, seed: seedRobot(narrow), inspectorTab: route.inspectorTab ?? 'overview' })
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [narrow])

  // A pick, the narrow Back (null) or a tab change replaces the address. A
  // pick also ends the seed: after narrow's Back the roster must stay up,
  // not fall back to the robot a link asked for.
  const selectRobot = (robotId: string | null) => {
    setView((v) => ({ ...v, picked: robotId, seed: null }))
    replaceHash(hashForFleet(siteId, { robotId, inspectorTab }))
  }
  const selectInspectorTab = (next: InspectorTab, robotId: string) => {
    setView((v) => ({ ...v, picked: robotId, inspectorTab: next }))
    replaceHash(hashForFleet(siteId, { robotId, inspectorTab: next }))
  }

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
      <FleetRobotsView
        robots={robots} selectedRobotId={selectedRobotId} onSelect={selectRobot}
        inspectorTab={inspectorTab} onInspectorTabChange={selectInspectorTab}
      />
    </div>
  )
}
