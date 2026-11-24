import { useState } from 'react'
import { color } from '@/design-system/tokens'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTouchShell } from '@/lib/useTouchShell'
import type { Orientation } from '@/lib/touchShell'
import type { RobotRunView } from '@/liveops/robotRun'
import type { Mission, RobotState } from '@/types'
import { TouchDock, touchDockHeight } from './TouchDock'
import { TouchTopStrip, touchStripHeight } from './TouchTopStrip'

/**
 * LiveOps for a handheld: one strip of readings, a body, and a dock that never
 * collapses (design §7.2). Chosen once by `useTouchShell` and mounted by
 * `LiveOpsWorkspace` **inside** its `[data-fullscreen-root]` element, so the
 * E-Stop in the dock is inside the fullscreen subtree in every state -- the
 * invariant `docs/audit/2026-08-12-ui-ux-audit.md` A-02 exists for.
 *
 * This shell replaces the desktop chrome, not the leaves: the map, the camera,
 * the E-Stop, `commandPolicy` and `commandDeck` are the same modules the
 * desktop views use. Nothing here branches on a device name.
 *
 * **Immersive mode is CSS, not the Fullscreen API.** iPhone Safari has no
 * Fullscreen API at all and `useFullscreenToggle` silently does nothing there,
 * so the shell collapses its own strip instead and leaves the dock -- and with
 * it the E-Stop -- mounted. The real API stays owned by `LiveOpsWorkspace`,
 * where it works.
 */

/* ── touch-body:begin ────────────────────────────────────────────────────────
 *
 * ⚠️ **Task 10 (the watching layout) replaces `TouchBody` below, and nothing
 * else in this file.** It renders `TouchWatchLayout` from the same props: map
 * and camera panes laid out by `watchPanes()` from `touchLayout.ts`, with the
 * run card floating over the map. Task 14 then switches between that and
 * `TouchDriveLayout` on `operatorHoldsControl(robot)`.
 *
 * `barH` and `dockH` are passed because this file owns those two constants and
 * `PaneGeometry` needs them; the body's own width and height are its to measure
 * (a `ResizeObserver` on the element below), not this shell's to guess.
 */

export interface TouchBodyProps {
  siteId: string
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  orientation: Orientation
  big: boolean
  /** Height of the top strip, 0 while immersive. */
  barH: number
  /** Height of the dock. It never collapses, so this is never 0. */
  dockH: number
  /** Dismisses an ended run — the run card's own control (Task 10). */
  onDismissRun?: () => void
}

/** The seam. A placeholder until Task 10: it occupies the body so the strip
 * and the dock can be laid out and tested, and draws nothing of its own. */
function TouchBody({ orientation, big }: TouchBodyProps) {
  return (
    <div
      data-touch-body=""
      data-orientation={orientation}
      data-size={big ? 'big' : 'small'}
      style={{
        flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
        background: color.bg,
        // Carried over from the desktop workspace: the panes' own overlay
        // z-indexes (video labels, camera bars) stay inside this box rather
        // than competing with the dock's sheet and dialogs above it.
        isolation: 'isolate',
      }}
    />
  )
}

/* ── touch-body:end ──────────────────────────────────────────────────────── */

export function TouchLiveOps({ siteId, robot, mission, run, immersive: immersiveProp, onDismissRun }: {
  siteId: string
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  /** Controlled immersive state. Left undefined the shell owns it, which is
   * what `LiveOpsWorkspace` does; a value pins it, which is what a test and a
   * future deep link do. */
  immersive?: boolean
  onDismissRun?: () => void
}) {
  const { orientation, big } = useTouchShell()
  const [ownImmersive, setOwnImmersive] = useState(false)
  const immersive = immersiveProp ?? ownImmersive
  const barH = immersive ? 0 : touchStripHeight(big)
  const dockH = touchDockHeight(big)

  return (
    <div
      data-touch-shell=""
      style={{
        flex: 1, minHeight: 0, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        background: color.bg,
        // The shell's chrome is the only scrollable surface; the body never is.
        overflow: 'hidden',
      }}
    >
      {/* Its own boundary: a bad reading takes the strip, never the dock
          below it, and never the E-Stop inside the dock. */}
      {!immersive && (
        <ErrorBoundary area="LiveOps touch strip" variant="strip" resetKeys={[robot.robot_id]}>
          <TouchTopStrip robot={robot} big={big} />
        </ErrorBoundary>
      )}

      <ErrorBoundary area="LiveOps touch body" variant="pane" resetKeys={[robot.robot_id, orientation]}>
        <TouchBody
          siteId={siteId}
          robot={robot}
          mission={mission}
          run={run}
          orientation={orientation}
          big={big}
          barH={barH}
          dockH={dockH}
          onDismissRun={onDismissRun}
        />
      </ErrorBoundary>

      {/* Outside every boundary on purpose: this dock holds the E-Stop. */}
      <TouchDock
        robot={robot}
        run={run}
        big={big}
        immersive={immersive}
        onToggleImmersive={() => setOwnImmersive((v) => !v)}
      />
    </div>
  )
}
