import { color, glass, radius, space } from '@/design-system/tokens'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTouchShell } from '@/lib/useTouchShell'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import type { RobotRunView } from '@/liveops/robotRun'
import { useSessionStore } from '@/store/useSessionStore'
import type { Mission, RobotState } from '@/types'
import { TouchDock, touchDockHeight } from './TouchDock'
import { cornerEstopSize } from './touchLayout'
import { TouchCornerEstop } from './TouchDriveLayout'
import { TouchDriveLayout } from './TouchDriveLayout'
import { TouchReadings, TouchTopStrip, touchStripHeight } from './TouchTopStrip'
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

/** What the readings overlay keeps clear at each end. The camera's own
 * controls used to be in the top-right corner and this reserved their 48 px;
 * they are at the foot of the pane now, so the top band is the overlay's and
 * this is a margin. */
const READINGS_OVERLAY_INSET = space[3]

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
          orientation={orientation}
          onBack={immersed ? () => setLiveOpsImmersed(false) : undefined}
        />
      </ErrorBoundary>

      {/* Portrait: the readings float on the view, between the strip and the
          dock (operator, 2026-11-25). A 390 px row cannot hold the identity,
          six readings and the two status icons -- measured, the readings got
          48 px of it -- and the picture below has room to spare.

          Two things are already in this corner and neither may be covered:
          the camera's front/rear switch at the top-right (48 px, so the row
          stops short of it), and while driving the corner E-Stop in the same
          place, which is why the row drops below it then. */}
      {orientation === 'portrait' && (
        <div
          data-touch-readings-overlay=""
          className="rh-on-video"
          style={{
            position: 'absolute',
            // ⚠️ Under a popover, not over it. At 55 this sat above the
            // robot selector's menu (Radix draws its content at z-50,
            // portalled to <body>, and this shell makes no stacking context
            // of its own) and swallowed the top of the list (operator,
            // 2026-11-25). It only has to clear the body, which isolates
            // its own layers.
            zIndex: 20,
            top: barH + space[2] + (driving ? cornerEstopSize(big).height + space[2] : 0),
            // Centred, and sized to its contents. The reserve keeps it clear
            // of BOTH top corners at once -- the camera's front/rear switch
            // on the right, and symmetry on the left so it reads as centred
            // rather than as a row that happens to start near the middle.
            // A full-width band with its contents centred, NOT a shrink-to-fit
            // box: with `max-width` alone a wrapping flex row collapses to its
            // max-content width, and this came out 195 px wide and four lines
            // tall in the middle of the picture.
            left: READINGS_OVERLAY_INSET, right: READINGS_OVERLAY_INSET,
            // Wraps rather than scrolls. A row the operator has to drag
            // sideways to finish reading is a row they will not finish
            // reading (operator, 2026-11-25), and out here on the picture a
            // second line costs 20 px of a view that has it -- which is not
            // true inside the strip, where the body height is the scarce
            // resource and the readings scroll instead.
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexWrap: 'wrap', gap: `${space[1]}px ${space[3]}px`,
            // Even padding all round, so the row is a band of readings
            // rather than a pill squeezed around them: the height follows
            // the content instead of being set (operator, 2026-11-25).
            padding: space[3],
            borderRadius: radius.md,
            // The same recipe as the map's tool group below it (NavTools), so
            // the two read as the same kind of thing floating on the picture.
            // The scrim is not decoration: over a bright frame the blur alone
            // leaves the figures at the mercy of the footage
            // (docs/audit/2026-08-12-ui-ux-audit.md A-16).
            ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-md)',
          } as React.CSSProperties}
        >
          <TouchReadings robot={robot} />
        </div>
      )}

      <ErrorBoundary area="LiveOps touch body" variant="pane" resetKeys={[robot.robot_id, orientation]}>
        {driving ? <TouchDriveLayout {...body} /> : <TouchWatchLayout {...body} />}
      </ErrorBoundary>

      {/* Exactly one stop control, in every state, decided here and rendered
          outside every boundary. While driving both thumbs are on the sticks,
          so it moves to the top-right corner where a palm will not find it and
          the dock gives up its own (design §7.2.5). Watching, it is anchored in
          the dock. Never both, never neither. */}
      {driving && <TouchCornerEstop robot={robot} big={big} top={barH + space[2]} />}
      <TouchDock robot={robot} mission={mission} run={run} big={big} driving={driving} />
    </div>
  )
}
