import { Battery, ChevronLeft, Columns2, Compass, Footprints, Gauge, MapPin, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { StatePill } from '@/components/common/StatePill'
import { ConnectionStatus } from '@/components/shell/ConnectionStatus'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { legConfigLabelKey, legConfigOf } from '@/liveops/legConfig'
import { compassLabel } from '@/liveops/waypointGeometry'
import type { RobotState } from '@/types'

/**
 * The touch shell's chrome at the top: two zones in one row (design §6.1).
 *
 * ⚠️ **The identity never scrolls.** The strip used to be one scrolling row of
 * spelled-out captions, which took the robot's own name off screen the moment
 * the readings overflowed -- the operator could not tell which robot they were
 * commanding. So the row now holds a **pinned zone** (back chevron, robot
 * selector, state pill, link) that cannot shrink or scroll, a hairline, and a
 * **scrolling zone** carrying the readings. The strip itself no longer
 * scrolls; the readings zone does.
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
`

/** One reading. `name` is what a test names when a reading goes missing, and
 * what the drive layout reads to hide a reading it covers. `label` is the
 * reading's translated name: it is not drawn, because the icon carries it, but
 * it stays in the accessibility tree so the strip is still readable aloud. */
function Item({ name, icon: Icon, label, children }: {
  name: string
  icon?: LucideIcon
  label?: string
  children: React.ReactNode
}) {
  return (
    <span
      data-strip-item={name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        fontSize: font.size.sm, color: color.t1, whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {Icon && <Icon size={14} strokeWidth={1.6} color={color.t3} aria-hidden style={{ flexShrink: 0 }} />}
      {label && <span className="sr-only">{label}</span>}
      {children}
    </span>
  )
}

function Divider() {
  return <span aria-hidden style={{ width: 1, height: 16, background: color.border, flexShrink: 0 }} />
}

export function TouchTopStrip({ robot, big, onBack }: {
  robot: RobotState
  big: boolean
  /** Leaves the live view for the rest of the console. Absent when there is
   * nothing to go back to, and then no chevron is drawn at all. */
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const h = touchStripHeight(big)
  const target = big ? 48 : 44
  const heading = Math.round(robot.position.heading_deg)
  const legs = legConfigOf(robot)

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
        display: 'flex', alignItems: 'center', gap: space[3],
        padding: `0 ${space[3]}px`,
        background: color.surface, borderBottom: `1px solid ${color.border}`,
        // The strip is the frame; the readings zone below is what scrolls.
        flexWrap: 'nowrap', overflow: 'hidden',
      } as React.CSSProperties}
    >
      <style>{TOUCH_TARGET_CSS}</style>

      {/* Pinned: which robot, what it is doing, whether it is alive. No
          horizontal scroll may ever take these off screen. */}
      <div
        data-strip-zone="pinned"
        style={{
          display: 'flex', alignItems: 'center', gap: space[2],
          flexShrink: 0, flexWrap: 'nowrap',
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('touch.liveops.navAria')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: target, height: '100%', flexShrink: 0,
              marginLeft: -space[2], padding: 0,
              background: 'transparent', border: 'none', borderRadius: radius.sm,
              color: color.t1, cursor: 'pointer',
            }}
          >
            <ChevronLeft size={20} strokeWidth={1.8} aria-hidden />
          </button>
        )}
        <Item name="robot"><RobotSelector /></Item>
        <Item name="state"><StatePill state={robot.abstract_state} sdkState={robot.sdk_state} size="sm" /></Item>
        {/* The one connection no per-reading badge can report, and the reason
            it is pinned: a reading is worthless if the link behind it is down. */}
        <Item name="link"><ConnectionStatus robot={robot} /></Item>
      </div>

      <Divider />

      <div
        data-strip-zone="readings"
        style={{
          display: 'flex', alignItems: 'center', gap: space[3],
          flex: 1, minWidth: 0,
          flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
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
      </div>
    </div>
  )
}
