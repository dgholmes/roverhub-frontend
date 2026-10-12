import { useEffect, useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { LinkBannerInline } from './LinkBanner'
import { LeftRail } from './rail/LeftRail'
import { HeroView } from './hero/HeroView'
import { CockpitView } from './hero/CockpitView'
import { SplitView } from './hero/SplitView'
import { DualCamView } from './hero/DualCamView'
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

/**
 * LiveOps control room. View mode (docs/05-ui-ux.md §4) selects between
 * MapFirstView, HeroView (camera), SplitView, CockpitView and DualCamView —
 * only Cockpit collapses the left rail (§3); the site bar (with connection
 * status and the log toggle) and CurrentTaskBar with the E-Stop are unaffected
 * by view mode.
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
  const robots = useLiveOpsStore((s) => s.robots)
  const missions = useLiveOpsStore((s) => s.missions)
  const events = useLiveOpsStore((s) => s.events)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const viewMode = useSessionStore((s) => s.viewMode)
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const [logsOpen, setLogsOpen] = useState(false)
  const { ref: fullscreenRef, isFullscreen, toggle: toggleFullscreen } = useFullscreenToggle<HTMLDivElement>()

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  const robot = robots.find((r) => r.robot_id === selectedRobotId) ?? robots[0]

  if (!robot) {
    // Three distinct states, not one. An empty list previously always read
    // "No robots assigned to this site yet." — a configuration message shown
    // just as readily when the broker was unreachable, which is an outage.
    // docs/audit/2026-08-12-ui-ux-audit.md A-24.
    const settled = linkPhase === 'connected'
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SiteContextStrip siteId={siteId} workspace="LiveOps" />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: space[3],
        alignItems: 'center', justifyContent: 'center', padding: space[6],
      }}>
        <LinkBannerInline style={{ maxWidth: 560 }} />
        <div style={{ color: color.t2, fontSize: font.size.lg, textAlign: 'center', maxWidth: 460 }}>
          {settled
            ? 'No robots assigned to this site yet.'
            : 'Waiting for the live data service. Robots will appear as soon as their bridges report in.'}
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
          rather than running full-width underneath it. Cockpit is the one
          mode that collapses it (docs/05-ui-ux.md §3). */}
      {viewMode !== 'cockpit' && <LeftRail />}

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
        {viewMode === 'map' ? (
          <MapFirstView robot={robot} mission={mission} />
        ) : viewMode === 'cockpit' ? (
          <CockpitView robot={robot} mission={mission} />
        ) : viewMode === 'split' ? (
          <SplitView robot={robot} mission={mission} />
        ) : viewMode === 'dualcam' ? (
          <DualCamView robot={robot} mission={mission} />
        ) : (
          <HeroView robot={robot} mission={mission} />
        )}
        {/* The log opens as a drawer above the command bar, so the E-Stop
            never moves when it does. */}
        <EventLogPanel open={logsOpen} events={events} />
        <CurrentTaskBar robot={robot} mission={mission} />
      </div>
    </div>
  )
}
