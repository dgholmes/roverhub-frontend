import { Battery, ChevronLeft, Columns2, Compass, Footprints, Gauge, MapPin, Settings, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { hashForOrgPage } from '@/app/routes'
import { IconButton } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { StatePill } from '@/components/common/StatePill'
import { AlertCenterButton } from '@/components/shell/AlertCenterButton'
import { ConnectionStatus } from '@/components/shell/ConnectionStatus'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { legConfigLabelKey, legConfigOf } from '@/liveops/legConfig'
import { compassLabel } from '@/liveops/waypointGeometry'
import type { Orientation } from '@/lib/touchShell'
import type { RobotState } from '@/types'

/**
 * The touch shell's chrome at the top: two zones in one row (design §6.1).
 *
 * ⚠️ **Two pinned ends, and the readings between them in landscape only.** The strip used to be
 * one scrolling row of spelled-out captions, which took the robot's own name
 * off screen the moment the readings overflowed -- the operator could not tell
 * which robot they were commanding. So the row is pinned at both ends:
 *
 * - **left**, which robot this is: the back chevron and the selector;
 * - **middle**, the readings, and the only thing that scrolls;
 * - **right**, the status: what the robot is doing (the state pill), how good
 *   the link is (a signal meter that opens the per-link panel) and the alert
 *   centre. The right end is where a handheld's own status bar puts these, and
 *   it is the end a thumb reaches on a tablet held two-handed (operator,
 *   2026-11-25).
 *
 * Neither pinned zone may shrink or scroll. The strip itself does not scroll;
 * the readings zone does.
 *
 * ⚠️ **One row, always.** Neither zone wraps to a second row: on a handheld the
 * body height is the scarce resource, and a wrapped strip takes 44 px off the
 * map and the camera to show a reading nobody asked to be taller.
 * `TelemetryStripPane` (feed/TelemetryPanel.tsx) is the desktop counterpart and
 * wraps on purpose, which is why this is its own component rather than a prop
 * on that one.
 *
 * **Icons, and the two readings that keep a word.** Each reading is a Lucide
 * icon plus its value; the CAPS caption is gone because it cost more width
 * than it carried. Gait and legs keep their *word value* (`walk`, `normal`) --
 * an icon plus a bare word is readable, an icon alone is not, and "legs:
 * normal" is not a concept an icon can carry. Battery, speed, heading and
 * position are self-describing. Every reading still carries its translated
 * name for a screen reader, and every badge behaviour is unchanged.
 *
 * The composite chips -- the selector, the state pill and the link chip -- are
 * the same components the desktop bar uses, so there is one answer per reading
 * in the console rather than a touch-flavoured copy of each.
 *
 * ⚠️ `data-strip-item` names are an interface, not decoration: the drive
 * layout reads them to hide the readings its own strip already covers. Never
 * rename one.
 */

/**
 * What a 390 px row gives each zone, and which one gives way when it cannot.
 *
 * Both ends are pinned, so every pixel one takes is a pixel the readings do
 * not get. Measured at 375 px, which is the narrowest phone this console
 * supports: chevron 40, robot name up to 104, state pill 77 (Korean) to 128
 * ("Manual Control"), link 28, bell 28, battery 42, chrome 50. That sums to
 * 420 at the widest -- 45 px over the row.
 *
 * So the order of what may be lost is decided here rather than by whichever
 * element happens to be last:
 *
 * 1. **The battery never goes.** `PHONE_READINGS_MIN_WIDTH` is a floor on the
 *    scrolling zone, so it can never be squeezed below one reading. Hiding
 *    the battery of the robot being commanded is the failure this whole
 *    strip was reworked to end, twice now.
 * 2. **The link and the alert bell never go.** They are 28 px each and they
 *    are the only way to see a dropped link or an alert while immersed.
 *  3. **The state pill is never truncated.** A half-drawn state word is worse
 *    than a short robot name, and colour may not be the only signal
 *    (docs/05-ui-ux.md §19).
 * 4. **The robot name is what gives.** It ellipsizes from 104 px down to
 *    `PHONE_ROBOT_MIN_WIDTH`, which still shows the dog, the number and the
 *    state dot -- `RVR-04…` identifies the robot, and the full name is one
 *    tap away in the selector it is the trigger for.
 */
export const PHONE_ROBOT_MAX_WIDTH = 120
export const PHONE_ROBOT_MIN_WIDTH = 100
export const PHONE_READINGS_MIN_WIDTH = 48

/** The cap when the readings are NOT in the row -- portrait, where they are
 * an overlay on the view. Nothing is competing for the middle then, so the
 * name gets most of what it asks for and only a very long one ellipsizes. */
export const PHONE_ROBOT_MAX_WIDTH_ROOMY = 180

/**
 * How tall a control is on the two surfaces that own their whole cell: the
 * dock and the drive strip.
 *
 * One number for both sizes. It was 48 on a tablet and 44 on a phone, which
 * the operator read as too tall twice (2026-11-25): those two rows together
 * take a band off the picture the shell exists to show, and a tablet is not
 * a reason to make a button bigger than a thumb needs. 40 px still clears
 * the WCAG 2.2 AA target size comfortably, and the E-Stop -- the one control
 * that should be the tallest thing in the dock -- keeps its own 48.
 *
 * The strip's own chips are NOT this: they take their target from an
 * invisible overlay instead, so the visible box keeps its natural height.
 */
export const TOUCH_CONTROL_HEIGHT = 40

/** The back chevron's visible box. Sized to its 20 px glyph, NOT to the row:
 * at the strip's own height it was 40 px around that glyph, which put 10 px
 * of empty box on each side and made the gap to the robot selector measure
 * 18 px when the gap is set to 8 (operator, 2026-11-25). The 44/48 px touch
 * target is unaffected -- it comes from the invisible ::after overlay, which
 * is the whole reason the visible box is free to be this size. */
export const BACK_BUTTON_SIZE = 32

/** Strip height, which is also the minimum height of every control inside it:
 * 44 px on a tablet, 40 px on a phone (design §7.2). */
export function touchStripHeight(big: boolean): number {
  return big ? 44 : 40
}

/** Shared controls hard-code a 36 px height (`commandButtonStyle`), which is
 * below a comfortable touch target. Rather than fork those components for one
 * shell, the touch chrome raises them from the outside. Scoped to the two
 * class names below, and both set `--rh-touch-target` on their own root.
 *
 * ⚠️ The two rules are deliberately different. The dock's controls own their
 * whole cell, so there a `min-height` on the button is exactly right. The
 * strip's are chips beside readings in a 40-44 px row, and the same rule there
 * made the robot selector a tall box filling the strip corner to corner. So
 * the strip gets its touch target as an invisible overlay on each button
 * instead: the *target* is at least 44 px while the *visible box* keeps its
 * natural height. The overlay is part of its own button for hit-testing, so
 * the tap still lands on the control.
 */
export const TOUCH_TARGET_CSS = `
.rh-touchstrip::-webkit-scrollbar,.rh-touchstrip ::-webkit-scrollbar,.rh-touchdeck::-webkit-scrollbar{display:none}
.rh-touchdeck button{min-height:var(--rh-touch-target,44px)}
.rh-touchstrip button{position:relative}
.rh-touchstrip button::after{content:"";position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:max(100%,var(--rh-touch-target,44px))}
.rh-touchstrip [data-strip-back]:hover,.rh-touchstrip [data-strip-back]:active{box-shadow:none}
`

/** One reading. `name` is what a test names when a reading goes missing, and
 * what the drive layout reads to hide a reading it covers. `label` is the
 * reading's translated name: it is not drawn, because the icon carries it, but
 * it stays in the accessibility tree so the strip is still readable aloud. */
function Item({ name, icon: Icon, label, maxWidth, shrinkTo, children }: {
  name: string
  icon?: LucideIcon
  label?: string
  /** Caps a reading that can outgrow its share of the strip. Only the robot
   * selector uses it, and only on a phone -- see where it is passed. */
  maxWidth?: number
  /** How narrow this item may be squeezed before the row overflows. Given,
   * it is the ONE item in its zone that gives way when the row runs out:
   * everything else keeps `flex-shrink: 0`. Only the robot selector uses it
   * -- see the note on PHONE_ROBOT_MAX_WIDTH for why it is the one. */
  shrinkTo?: number
  children: React.ReactNode
}) {
  return (
    <span
      data-strip-item={name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: font.size.sm, color: color.t1, whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: shrinkTo === undefined ? 0 : 1,
        ...(maxWidth === undefined && shrinkTo === undefined
          ? {}
          : { maxWidth, minWidth: shrinkTo ?? 0, overflow: 'hidden' }),
      }}
    >
      {Icon && <Icon size={14} strokeWidth={1.6} color={color.t3} aria-hidden style={{ flexShrink: 0 }} />}
      {label && <span className="sr-only">{label}</span>}
      {children}
    </span>
  )
}

/**
 * The six readings, in their one order.
 *
 * Its own component because it has two homes: the strip's right-hand end in
 * landscape, and an overlay on the view in portrait (operator, 2026-11-25).
 * One component, so the two can never drift into a different set, a
 * different order or a different number.
 *
 * ⚠️ **Battery leads, always.** On a phone only the first reading or two
 * are on screen at rest, and it must be the battery of the robot being
 * commanded.
 *
 * ⚠️ `data-strip-item` names are an interface, not decoration. Never
 * rename one.
 */
export function TouchReadings({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const heading = Math.round(robot.position.heading_deg)
  const legs = legConfigOf(robot)

  return (
    <>
      {/* First, and part of this row rather than of the identity beside the
          selector (operator, 2026-11-25): what the robot is doing is a live
          reading like the rest, and it is the one an operator looks for
          first. */}
      <Item name="state">
        <StatePill state={robot.abstract_state} sdkState={robot.sdk_state} size="sm" variant="plain" />
      </Item>
      {/* `null` is unknown, not flat: gRPC carries no battery field, so a
          gRPC-only host reports it forever. formatBatteryPercent and
          batteryLevelColor own that rule -- never a bare comparison, since
          `null < 30` is `false` and paints a dead battery healthy. */}
      <Item name="battery" icon={Battery} label={t('fleet.overview.battery')}>
        <span style={{ color: batteryLevelColor(robot.battery.percent), fontWeight: font.weight.semibold }}>
          {formatBatteryPercent(robot.battery.percent)}
        </span>
      </Item>
      <Item name="speed" icon={Gauge} label={t('fleet.overview.speed')}>{robot.speed_mps.toFixed(1)} m/s</Item>
      <Item name="heading" icon={Compass} label={t('fleet.overview.heading')}>{heading}° {compassLabel(heading)}</Item>
      {/* Gait and legs keep their word: no icon says `flying_trot`. */}
      <Item name="gait" icon={Footprints} label={t('liveops.telemetry.gait')}>{robot.gait.replace(/_/g, ' ')}</Item>
      {/* 'unknown' is never a synonym for normal: a gRPC-only host has no
          joint feed and reports it permanently (schema 0.0.12). */}
      <Item name="legs" icon={Columns2} label={t('liveops.telemetry.legs')}>{t(legConfigLabelKey(legs))}</Item>
      {/* docs/05-ui-ux.md §7.1/§18.4: every position value carries its quality. */}
      <Item name="position" icon={MapPin} label={t('liveops.telemetry.position')}>
        <span>{robot.position.x_m.toFixed(1)}, {robot.position.y_m.toFixed(1)} m</span>
        {robot.position.freshness !== 'live'
          ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
          : <EstimatedBadge compact quality={robot.position.quality} />}
      </Item>
    </>
  )
}

function Divider() {
  return <span aria-hidden style={{ width: 1, height: 16, background: color.border, flexShrink: 0 }} />
}

export function TouchTopStrip({ robot, big, orientation, onBack }: {
  robot: RobotState
  big: boolean
  orientation: Orientation
  /** Leaves the live view for the rest of the console. Absent when there is
   * nothing to go back to, and then no chevron is drawn at all. */
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const h = touchStripHeight(big)
  const target = big ? 48 : 44
  // Landscape has the width for the readings; portrait does not, and
  // `TouchLiveOps` overlays them on the view instead. One boolean, read
  // here, so the strip and the overlay cannot both draw them.
  const readingsInStrip = orientation === 'landscape'

  return (
    <div
      data-touch-strip=""
      className="rh-touchstrip"
      aria-label={t('liveops.telemetry.aria', { name: robot.name })}
      style={{
        // `--rh-touch-target` is read by TOUCH_TARGET_CSS above. It is the
        // touch target, not the strip's height: the strip is 40 px on a phone
        // and a 40 px target is below the floor.
        ['--rh-touch-target' as string]: `${target}px`,
        height: h, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        // Both ends are pinned now, so the gaps come out of the readings.
        // 12 px between three zones plus the padding is 48 px of a 390 px
        // phone; 8 px gives a second reading back.
        // 6 px between the zones only while the readings are competing for
        // the row; with them overlaid on the view, a phone has the room for
        // the ordinary gap.
        gap: big || !readingsInStrip ? space[3] : 6,
        // The chevron used to pull itself 8 px into the padding, which left
        // it 4 px off the edge of the screen and read as a rendering fault
        // rather than as an inset (operator, 2026-11-25).
        padding: `0 ${big ? space[4] : space[3]}px`,
        background: color.surface, borderBottom: `1px solid ${color.border}`,
        // The strip is the frame; the readings zone below is what scrolls.
        flexWrap: 'nowrap', overflow: 'hidden',
      } as React.CSSProperties}
    >
      <style>{TOUCH_TARGET_CSS}</style>

      {/* Pinned left: which robot. No horizontal scroll may ever take it
          off screen -- an operator who cannot see which robot they are
          commanding is the failure this zone exists for. */}
      <div
        data-strip-zone="pinned"
        style={{
          display: 'flex', alignItems: 'center', gap: big || !readingsInStrip ? space[2] : 6,
          flexWrap: 'nowrap',
          // A phone's row cannot hold everything at its natural width, and
          // this zone is where the design chooses to lose some: see
          // PHONE_ROBOT_MAX_WIDTH. A tablet never runs out, so it does not
          // shrink at all.
          flexShrink: big ? 0 : 1,
          minWidth: big ? undefined : 0,
        }}
      >
        {onBack && (
          /* Square, and with no resting or hover fill. It is a way out of the
             view, not a control with a state, and the base button tint
             (kit.css) painted it as a wide grey rectangle the moment a mouse
             crossed it (operator, 2026-11-25). The 48 px touch target is still
             there -- it comes from the invisible ::after overlay above, which
             is why the visible box can be the strip's own height. */
          <button
            type="button"
            data-strip-back=""
            onClick={onBack}
            aria-label={t('touch.liveops.navAria')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: BACK_BUTTON_SIZE, height: BACK_BUTTON_SIZE, flexShrink: 0, padding: 0,
              background: 'transparent', border: 'none', borderRadius: radius.md,
              color: color.t1, cursor: 'pointer',
            }}
          >
            <ChevronLeft size={20} strokeWidth={1.8} aria-hidden />
          </button>
        )}
        {/* Capped on a phone, measured at 375 px: the chevron, an untruncated
            `RVR-05 "Harbor"` and the state pill filled the width between them
            and left no reading on screen at rest. The name ellipsizes instead;
            a tablet has the room and gets no cap. */}
        <Item
          name="robot"
          maxWidth={big ? undefined : readingsInStrip ? PHONE_ROBOT_MAX_WIDTH : PHONE_ROBOT_MAX_WIDTH_ROOMY}
          shrinkTo={big ? undefined : PHONE_ROBOT_MIN_WIDTH}
        >
          <RobotSelector />
        </Item>
      </div>

      {/* Pushes everything after it to the right-hand end. */}
      <span aria-hidden style={{ flex: 1, minWidth: space[2] }} />

      {/* The readings, at the right-hand end beside the link and the alert
          bell (operator, 2026-11-25), so the identity keeps the left edge
          and the groups on the right read as one block of status.

          In PORTRAIT they are not here at all: `TouchLiveOps` draws them as
          an overlay on the view instead. A 390 px row cannot hold the
          identity, six readings and two icons, and the view below has room
          to spare. */}
      {readingsInStrip && (
        <>
          <Divider />
          <div
            data-strip-zone="readings"
            style={{
              display: 'flex', alignItems: 'center', gap: space[3],
              // The floor is the point: whatever else the row is asked to
              // hold, the battery of the robot being commanded stays on
              // screen.
              flexShrink: 1, minWidth: PHONE_READINGS_MIN_WIDTH,
              flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            } as React.CSSProperties}
          >
            <TouchReadings robot={robot} />
          </div>
        </>
      )}

      <Divider />

      {/* Pinned right: the console's own state, not the robot's. The link as
          a signal meter and the alert centre -- which lives here because an
          immersed LiveOps draws neither the site bar nor the tab bar, and
          without it there is no way to see an alert while driving. The
          robot's own state is beside the robot, at the other end.

          The link is an icon, not the desktop's worded chip: at 375 px the
          word plus a dot plus a chevron is about 110 px, and the readings need
          that width more than a healthy link needs to say so. Its panel is
          portalled, which is what makes it open at all inside this strip. */}
      <div
        data-strip-zone="status"
        style={{
          display: 'flex', alignItems: 'center', gap: space[1],
          flexShrink: 0, flexWrap: 'nowrap', marginRight: -space[1],
        }}
      >
        <Item name="link"><ConnectionStatus robot={robot} variant="icon" /></Item>
        {/* On a phone too (operator, 2026-11-25), and the room for it is
            bought rather than found: see PHONE_ROBOT_MAX_WIDTH and the
            narrowed gaps above. Measured at 390 px with all three here, the
            readings keep 59 px -- enough for the battery (42 px) at rest and
            nothing else, which is the floor this strip may not go below.
            Anything further added to either pinned zone breaks that. */}
        <Item name="alerts"><AlertCenterButton /></Item>
        {/* Beside the bell, as on the site bar the other workspaces get. An
            immersed LiveOps draws no site bar, so without it there is no way
            into Settings from inside the live view at all -- the same
            argument that put the bell here (operator, 2026-11-25). */}
        <Item name="settings">
          <IconButton
            icon={Settings}
            size="sm"
            label={t('settings.open')}
            onClick={() => { window.location.hash = hashForOrgPage('Settings') }}
          />
        </Item>
      </div>
    </div>
  )
}
