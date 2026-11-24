import { color, space } from '@/design-system/tokens'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTouchShell } from '@/lib/useTouchShell'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import type { RobotRunView } from '@/liveops/robotRun'
import { useSessionStore } from '@/store/useSessionStore'
import type { Mission, RobotState } from '@/types'
import { TouchDock, touchDockHeight } from './TouchDock'
import { TouchCornerEstop } from './TouchDriveLayout'
import { TouchDriveLayout } from './TouchDriveLayout'
import { TouchTopStrip, touchStripHeight } from './TouchTopStrip'
import { TouchWatchLayout } from './TouchWatchLayout'

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
 * **There is no immersive mode to toggle, and no immersive button** (design
 * §6.2). Entering LiveOps on touch *is* entering the live view: `SiteShell`
 * draws neither the site bar nor the tab bar while `liveOpsImmersed` is set,
 * and the strip's back chevron clears it to bring the console's navigation
 * back. What the old immersive button hid was the readings -- the one thing
 * the operator needs -- while leaving the navigation, which is backwards. So
 * the strip is always drawn here, and `barH` never collapses.
 *
 * The Fullscreen API is not involved: iPhone Safari has none, and it stays
 * owned by `LiveOpsWorkspace` for the desktop, where it works.
 */

/* ── touch-body:begin ────────────────────────────────────────────────────────
 *
 * The body is one of exactly two layouts, both laid out from `touchLayout.ts`
 * against the same `PaneGeometry`:
 *
 * - `TouchWatchLayout` -- the map and camera panes side by side, with the run
 *   card floating over the map;
 * - `TouchDriveLayout` -- the camera with the body, the map an inset (or, in
 *   portrait, both at full width), the sticks, and the corner E-Stop.
 *
 * ⚠️ **The switch is `operatorHoldsControl(robot)` and nothing else** (design
 * §7.2.3): holding control means driving. Never `abstract_state` -- a wheel
 * robot reads MANUAL merely for being upright -- and never a `mission:` or
 * `nav:` owner, which is control held by a program rather than by a person.
 * There is no third, intermediate state, so there is no third layout.
 *
 * `barH` and `dockH` are passed because this file owns those two constants and
 * `PaneGeometry` needs them; the body's own width and height are its to measure
 * (a `ResizeObserver` on the element it renders), not this shell's to guess.
 */

export type { TouchBodyProps } from './TouchWatchLayout'

/* ── touch-body:end ──────────────────────────────────────────────────────── */

export function TouchLiveOps({ siteId, robot, mission, run, onDismissRun }: {
  siteId: string
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  onDismissRun?: () => void
}) {
  const { orientation, big } = useTouchShell()
  const immersed = useSessionStore((s) => s.liveOpsImmersed)
  const setLiveOpsImmersed = useSessionStore((s) => s.setLiveOpsImmersed)
  const barH = touchStripHeight(big)
  const dockH = touchDockHeight(big)
  // Control means driving. One predicate, read once, so the body and the
  // chrome can never disagree about which mode this is.
  const driving = operatorHoldsControl(robot)
  const body = {
    siteId, robot, mission, run, orientation, big, barH, dockH, onDismissRun,
  }

  return (
    <div
      data-touch-shell=""
      style={{
        flex: 1, minHeight: 0, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        // The positioning context for the corner stop, which must not live
        // inside the body's boundary -- see TouchCornerEstop's note.
        position: 'relative',
        background: color.bg,
        // The shell's chrome is the only scrollable surface; the body never is.
        overflow: 'hidden',
      }}
    >
      {/* Always drawn: the readings are what the operator came for, and the
          navigation is what the chevron fetches back. Its own boundary, so a
          bad reading takes the strip, never the dock below it, and never the
          E-Stop inside the dock.

          The chevron is passed only while the view is immersed. Once the bars
          are back, going "back" again would do nothing, and a control that
          does nothing is worse than no control -- so `onBack` is undefined and
          `TouchTopStrip` draws no chevron at all. */}
      <ErrorBoundary area="LiveOps touch strip" variant="strip" resetKeys={[robot.robot_id]}>
        <TouchTopStrip
          robot={robot}
          big={big}
          onBack={immersed ? () => setLiveOpsImmersed(false) : undefined}
        />
      </ErrorBoundary>

      <ErrorBoundary area="LiveOps touch body" variant="pane" resetKeys={[robot.robot_id, orientation]}>
        {driving ? <TouchDriveLayout {...body} /> : <TouchWatchLayout {...body} />}
      </ErrorBoundary>

      {/* Exactly one stop control, in every state, decided here and rendered
          outside every boundary. While driving both thumbs are on the sticks,
          so it moves to the top-right corner where a palm will not find it and
          the dock gives up its own (design §7.2.5). Watching, it is anchored in
          the dock. Never both, never neither. */}
      {driving && <TouchCornerEstop robot={robot} big={big} top={barH + space[2]} />}
      <TouchDock robot={robot} run={run} big={big} driving={driving} />
    </div>
  )
}
