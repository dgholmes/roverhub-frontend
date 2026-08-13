import { useEffect, useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { scopeToSite } from '@/liveops/siteScope'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { LinkBannerInline } from './LinkBanner'
import { LeftRail } from './rail/LeftRail'
import { HeroView } from './hero/HeroView'
import { CockpitView } from './hero/CockpitView'
import { SplitView } from './hero/SplitView'
import { DualCamView } from './hero/DualCamView'
import { CurrentTaskBar } from './mission/CurrentTaskBar'
import { EventLogPanel } from './mission/EventLogPanel'
import { SystemStatusBar } from './systembar/SystemStatusBar'

/**
 * LiveOps control room. View mode (docs/05-ui-ux.md §4) selects between
 * HeroView (Default), CockpitView, and SplitView — only Cockpit collapses the
 * left rail (§3), everything else (CurrentTaskBar, E-Stop, timeline,
 * SystemStatusBar) is unaffected by view mode.
 *
 * Fullscreen is owned here, on the workspace column, rather than by each view
 * on its own hero container. The hero container is a *sibling* of
 * CurrentTaskBar and SystemStatusBar, so fullscreening it took the E-Stop, the
 * whole command bar and system health off the screen — while leaving
 * ManualControlOverlay (which lives inside the hero) mounted and driving. That
 * put the operator in the one mode where teleop is most used with no stop
 * control present. Owning the ref one level up keeps the bars inside the
 * fullscreen element, and also brings Radix dialogs back into view, since they
 * portal to a container within it rather than to a `document.body` that is
 * outside the fullscreen subtree.
 * docs/audit/2026-08-12-ui-ux-audit.md A-02/A-03.
 */
export function LiveOpsWorkspace() {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const allRobots = useLiveOpsStore((s) => s.robots)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  // Only this site's robots. Previously every robot in the store was offered
  // here regardless of the site in the route.
  // docs/audit/2026-08-12-ui-ux-audit.md A-34.
  const robots = scopeToSite(allRobots, activeSiteId)
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
        {/* No full-width link banner here. Connection state lives in
            SystemStatusBar's "Cloud Link" item, and per-value staleness is
            already carried by StaleBadge / LastKnownBadge on the readings
            themselves. A banner made it the sixth simultaneous statement of the
            same fact and the loudest thing on screen, and reflowed the layout
            whenever it appeared. Duplicate status indicators are their own
            usability problem — docs/audit/2026-08-12-ui-ux-audit.md §21. */}
        {viewMode === 'cockpit' ? (
          <CockpitView robot={robot} mission={mission} fullscreen={{ isFullscreen, onToggle: toggleFullscreen }} />
        ) : viewMode === 'split' ? (
          <SplitView robot={robot} mission={mission} fullscreen={{ isFullscreen, onToggle: toggleFullscreen }} />
        ) : viewMode === 'dualcam' ? (
          <DualCamView robot={robot} mission={mission} fullscreen={{ isFullscreen, onToggle: toggleFullscreen }} />
        ) : (
          <HeroView robot={robot} mission={mission} fullscreen={{ isFullscreen, onToggle: toggleFullscreen }} />
        )}
        <CurrentTaskBar robot={robot} mission={mission} />
        <EventLogPanel open={logsOpen} events={events} />
        <SystemStatusBar
          robot={robot}
          logsOpen={logsOpen}
          onToggleLogs={() => setLogsOpen((o) => !o)}
        />
      </div>
    </div>
  )
}
