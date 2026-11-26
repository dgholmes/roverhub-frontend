import { useSiteRobots } from '@/org/useSiteRobots'
import { useEffect, useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { FleetRobotsView, useRosterOrder } from './v2/FleetRobotsView'
import { DocksPlaceholder } from './v2/DocksPlaceholder'
import { useTranslation } from 'react-i18next'
import { useTouchShell } from '@/lib/useTouchShell'
import { fleetRobotFromHash, hashForFleetRobot, hashForSiteWorkspace, type RobotTab } from '@/app/routes'

type FleetTab = 'robots' | 'docks'
const TABS: FleetTab[] = ['robots', 'docks']

/** The hash, or none where there is no window (markup rendered in a test). */
function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash
}

/** Is this hash Fleet in this site, bare or naming a robot? */
function isFleetOf(siteId: string, hash: string): boolean {
  const base = hashForSiteWorkspace(siteId, 'Fleet')
  return hash === base || hash.startsWith(`${base}/`) || hash.startsWith(`${base}?`)
}

/**
 * Fleet workspace (docs/01-prd.md §9, docs/05-ui-ux.md §10): the detailed
 * home of device status. LiveOps only shows compact summaries; here each robot
 * gets an attention-sorted roster entry and a full inspector (Overview,
 * Motors, Motion tests, Edge device, Service).
 *
 * Each robot's edge device lives in its inspector, since a bridge serves one
 * robot. Docks keep their own tab because a dock is shared between robots.
 *
 * The address names the robot and its tab: `#/site/{id}/fleet` is the roster,
 * `.../fleet/{robotId}` a robot's Overview, `.../fleet/{robotId}/{tab}` any
 * other tab (routes.tsx `hashForFleetRobot`).
 */
export function FleetWorkspace({ siteId }: { siteId: string }) {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useSiteRobots()
  const { t } = useTranslation()
  const { narrow } = useTouchShell()
  const [tab, setTab] = useState<FleetTab>('robots')
  const sessionRobotId = useSessionStore((s) => s.selectedRobotId)
  const { sorted } = useRosterOrder(robots)

  // The address is the one place the robot and its tab are kept, so a shared
  // link opens what it names and Back walks through what was looked at. Read
  // again on every hashchange.
  const [hash, setHash] = useState(currentHash)
  useEffect(() => {
    const follow = () => setHash(window.location.hash)
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const addressed = fleetRobotFromHash(hash)
  const robotTab: RobotTab = addressed?.tab ?? 'overview'
  const onSite = (id: string | null | undefined) => !!id && robots.some((r) => r.robot_id === id)

  // Which robot shows. An address that names one of this site's robots wins
  // at any width.
  //
  // Wide (700 px and up, touch or not) always has a robot in the inspector.
  // A bare address shows the session's robot, so arriving from LiveOps or the
  // Dashboard opens the robot that was being looked at (docs/05-ui-ux.md
  // §2.3); an address naming a robot this site does not have shows the
  // roster's first. Either way the address is then rewritten to name it.
  //
  // Narrow is different, because there the inspector *replaces* the roster.
  // The session selection is almost never null -- `reconcileSelectedRobot`
  // puts it on `robotIds[0]` whenever it is invalid and the site has robots,
  // and SiteShell calls it on every site entry -- so falling back to it would
  // open a phone straight into an inspector nobody asked for, with the roster
  // and the Robots/Docks tabs hidden behind a back button. Narrow opens a
  // bare address on the roster, and a link that means a robot names it in
  // the address.
  //
  // This is a layout rule, so it hangs off `narrow`, never `touch`: a 1366 px
  // tablet has room for both panes and gets them (2026-11-26).
  const shownRobotId = addressed && onSite(addressed.robotId) ? addressed.robotId
    : narrow ? null
    : !addressed && onSite(sessionRobotId) ? sessionRobotId
    : sorted[0]?.robot_id ?? null

  // The address for what is shown, written over the current one in place so
  // the fallback adds no history entry for Back to land on. Not while the
  // site's robots are still loading: an empty list says nothing yet about the
  // robot the address names, and rewriting it then would lose the link.
  const canonical = robots.length === 0 ? null
    : shownRobotId ? hashForFleetRobot(siteId, shownRobotId, robotTab)
    : hashForSiteWorkspace(siteId, 'Fleet')
  useEffect(() => {
    // Only an address that is this site's Fleet: on the way to another
    // workspace this can run once more before the shell swaps it out.
    if (!canonical || hash === canonical || !isFleetOf(siteId, hash)) return
    window.history.replaceState(window.history.state, '', canonical)
    // replaceState fires no hashchange, so follow it by hand.
    setHash(window.location.hash)
  }, [canonical, hash, siteId])

  // A click is a new history entry; assigning the hash makes one. The state
  // follows at once rather than waiting for the hashchange to come back.
  const go = (next: string) => {
    window.location.hash = next
    setHash(window.location.hash)
  }
  const selectRobot = (robotId: string | null) => go(robotId
    ? hashForFleetRobot(siteId, robotId, robotTab)
    : hashForSiteWorkspace(siteId, 'Fleet'))
  const selectTab = (next: RobotTab) => {
    if (shownRobotId) go(hashForFleetRobot(siteId, shownRobotId, next))
  }

  // Narrow shows one pane at a time: a picked robot's inspector replaces the
  // roster, so the tabs that belong with the roster go too, and the
  // inspector's back control is the way back to both.
  const showingInspector = narrow && tab === 'robots' && shownRobotId !== null

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
      {!showingInspector && <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {TABS.map((key) => {
          const active = key === tab
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '6px 14px', borderRadius: radius.md,
                border: active ? `1px solid ${color.borderLt}` : '1px solid transparent',
                background: active ? color.selected : 'transparent',
                color: active ? color.t1 : color.t2,
                fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.regular,
                fontFamily: font.family, cursor: 'pointer',
              }}
            >
              {t(`fleet.tabs.${key}`)}
            </button>
          )
        })}
      </div>}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {tab === 'robots' && (
          <FleetRobotsView
            robots={robots} selectedRobotId={shownRobotId} onSelect={selectRobot}
            tab={robotTab} onTab={selectTab}
          />
        )}
        {tab === 'docks' && <DocksPlaceholder />}
      </div>
    </div>
  )
}
