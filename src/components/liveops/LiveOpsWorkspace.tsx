import { SiteEmptyNotice } from '@/components/shell/SiteEmptyNotice'
import i18n from '@/i18n'
import { useSiteRobots } from '@/org/useSiteRobots'
import { PatrolGridView } from './hero/PatrolGridView'
import { useEffect, useState } from 'react'
import { color, font, layout, space } from '@/design-system/tokens'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { useRobotRun } from '@/liveops/useRobotRun'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { LinkBannerInline } from './LinkBanner'
import { LeftRail } from './rail/LeftRail'
import { HeroView } from './hero/HeroView'
import { SplitView } from './hero/SplitView'
import { DualCamView } from './hero/DualCamView'
import { StackedView } from './hero/StackedView'
import { MapFirstView } from './hero/MapFirstView'
import { CurrentTaskBar } from './mission/CurrentTaskBar'
import { FullscreenButton } from './hero/FullscreenButton'
import { SiteContextStrip } from '@/components/shell/SiteContextStrip'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import { EventLogPanel } from './mission/EventLogPanel'
import { ConnectionStatus } from '@/components/shell/ConnectionStatus'
import { IconButton } from '@/components/kit'
import { ScrollText } from 'lucide-react'
import { resolveShownRobot } from '@/liveops/shownRobot'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

/**
 * LiveOps control room. View mode (docs/05-ui-ux.md §4) selects between
 * StackedView (the default: map over a second camera, main camera right),
 * HeroView (Cockpit, camera-first), MapFirstView, SplitView and DualCamView;
 * the left rail, the site bar (with connection status and the log toggle) and
 * CurrentTaskBar with the E-Stop are the same in every view mode.
 *
 * Fullscreen is owned here, on the workspace column, rather than by each view
 * on its own hero container. The hero container is a *sibling* of
 * CurrentTaskBar, so fullscreening it took the E-Stop, the whole command bar
 * and system health off the screen — while leaving
 * ManualControlOverlay (which lives inside the hero) mounted and driving. That
 * put the operator in the one mode where teleop is most used with no stop
 * control present. Owning the ref one level up keeps the bars inside the
 * fullscreen element, and also brings Radix dialogs back into view, since they
 * portal to a container within it rather than to a `document.body` that is
 * outside the fullscreen subtree.
 * docs/audit/2026-08-12-ui-ux-audit.md A-02/A-03.
 */
export function LiveOpsWorkspace({ siteId }: { siteId: string }) {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useSiteRobots()
  const missions = useLiveOpsStore((s) => s.missions)
  const events = useLiveOpsStore((s) => s.events)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const selectionPending = useSessionStore((s) => s.selectionPending)
  const viewMode = useSessionStore((s) => s.viewMode)
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const [logsOpen, setLogsOpen] = useState(false)
  const { ref: fullscreenRef, isFullscreen, toggle: toggleFullscreen } = useFullscreenToggle<HTMLDivElement>()

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  // Not robots[0] while an explicit choice is still being discovered: see shownRobot.ts.
  const { robot, waitingFor } = resolveShownRobot(robots, selectedRobotId, selectionPending)
  // Before the early return: hooks run on every render. Resets on robot switch.
  const { view: run, dismiss: dismissRun } = useRobotRun(robot?.robot_id ?? null)

  if (!robot) {
    // Three distinct states, not one. An empty list previously always read
    // "No robots assigned to this site yet." — a configuration message shown
    // just as readily when the broker was unreachable, which is an outage.
    // docs/audit/2026-08-12-ui-ux-audit.md A-24.
    const settled = linkPhase === 'connected'
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SiteContextStrip siteId={siteId} workspace="LiveOps">
        {/* While waiting, the selector still lists the robots that have
            reported, so the operator can switch to one (and its E-Stop). */}
        {waitingFor && <RobotSelector />}
      </SiteContextStrip>
      {!waitingFor && <SiteEmptyNotice siteId={siteId} workspace="LiveOps" />}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: space[3],
        alignItems: 'center', justifyContent: 'center', padding: space[6],
      }}>
        <LinkBannerInline style={{ maxWidth: 560 }} />
        <div style={{ color: color.t2, fontSize: font.size.lg, textAlign: 'center', maxWidth: 460 }}>
          {waitingFor ? i18n.t('sites.waitingForRobot', { robot: waitingFor })
            : settled ? i18n.t('sites.noRobotsHere') : i18n.t('sites.waitingLive')}
        </div>
      </div>
      </div>
    )
  }

  const mission = missions[robot.robot_id]

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* Sidebar spans the full remaining viewport height; everything else
          lives in the column to its right, so the bottom bars start after it
          rather than running full-width underneath it. */}
      {/* Its own boundary, so a fault in the robot list cannot reach the E-Stop. */}
      <ErrorBoundary
        area="LiveOps robot list" variant="pane"
        fallbackStyle={{ width: layout.liveOpsRailWidth, height: 'auto', flexShrink: 0 }}
      >
        <LeftRail />
      </ErrorBoundary>

      <div
        ref={fullscreenRef}
        // Marks the element that goes fullscreen, so the safety invariant
        // "the E-Stop is inside the fullscreen subtree" is directly
        // assertable rather than implied by JSX nesting.
        data-fullscreen-root
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
          // `relative` anchors the E-Stop failure banner; `background` matters
          // because this element is now the fullscreen target and would
          // otherwise paint the UA default behind the bars.
          position: 'relative', background: color.bg,
        }}
      >
        {/* No full-width link banner here. Connection state lives in the
            site bar's ConnectionStatus chip, and per-value staleness is
            already carried by StaleBadge / LastKnownBadge on the readings
            themselves. A banner made it the sixth simultaneous statement of the
            same fact and the loudest thing on screen, and reflowed the layout
            whenever it appeared. Duplicate status indicators are their own
            usability problem — docs/audit/2026-08-12-ui-ux-audit.md §21. */}
        {/* The site bar lives inside the fullscreen root, so the robot
            selector, view modes and the way back out of fullscreen are never
            lost to it. */}
        <ErrorBoundary area="LiveOps site bar" variant="strip" resetKeys={[robot.robot_id]}>
        <SiteContextStrip siteId={siteId} workspace="LiveOps">
          <RobotSelector />
          <ViewModeSelector />
          <ConnectionStatus robot={robot} />
          <IconButton
            icon={ScrollText}
            label={logsOpen ? 'Hide activity log' : 'Show activity log'}
            aria-pressed={logsOpen}
            onClick={() => setLogsOpen((o) => !o)}
            style={logsOpen ? { color: 'var(--rh-accent)', background: 'var(--rh-accent-dim)' } : undefined}
          />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </SiteContextStrip>
        </ErrorBoundary>
        {/* `isolation` keeps the views' own overlay z-indexes (video labels,
            camera bars, the manual-control card — all 850-900) inside this
            box. Without it they compete with the command bar's menus, which
            open upward over the view and lost: the Muted chip drew on top of
            the More menu. */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0, isolation: 'isolate' }}>
        {/* A fault in the view (or in a pane the view's own boundaries do
            not cover) stops here, so the command bar and its E-Stop below
            stay mounted. Switching robot or view mode tries again. */}
        <ErrorBoundary area="LiveOps view" variant="pane" resetKeys={[robot.robot_id, viewMode]}>
        {viewMode === 'map' ? (
          <MapFirstView robot={robot} mission={mission} />
        ) : viewMode === 'split' ? (
          <SplitView robot={robot} mission={mission} />
        ) : viewMode === 'dualcam' ? (
          <DualCamView robot={robot} mission={mission} />
        ) : viewMode === 'stacked' ? (
          <StackedView robot={robot} mission={mission} />
        ) : viewMode === 'grid' ? (
          <PatrolGridView />
        ) : (
          <HeroView robot={robot} mission={mission} />
        )}
        </ErrorBoundary>
        </div>
        {/* The log opens as a drawer above the command bar, so the E-Stop
            never moves when it does. */}
        <ErrorBoundary area="LiveOps activity log" variant="strip">
          <EventLogPanel open={logsOpen} events={events} />
        </ErrorBoundary>
        {/* Outside every boundary on purpose: this bar holds the E-Stop. */}
        <CurrentTaskBar robot={robot} mission={mission} run={run} siteId={siteId} onDismissRun={dismissRun} />
      </div>
    </div>
  )
}
